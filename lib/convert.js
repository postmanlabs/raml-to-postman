var fs = require('fs');
var uuidv4 = require('uuid/v4');
var path = require('path');
var validator = require('postman_validator');
var raml = require('raml-parser');
var _ = require('lodash').noConflict();
var async = require('async');

const DEFAULT_NAME = 'Postman Collection (From RAML0.8)';

var converter = {

    sampleFile: {},
    currentFolder: {},
    env: {},

    getMetaData: function(ramlString, callback) {
        raml.load(ramlString).then(function(data) {
            try {
                const collectionName = data.title ? data.title : DEFAULT_NAME,
                    environemntName = collectionName + '\'s Environment'

                return callback(null, {
                    result: true,
                    name: collectionName,
                    output: [{
                        type: 'collection',
                        name: data.title || 'Postman Collection (From RAML0.8)'
                    },
                    {
                        type: 'environment',
                        name: environemntName
                    }]
                });
            }
            catch (e) {
                return callback(e);
            }
        }, function(err) {
            return callback(err);
        });
    },

    parseString: function(ramlString, callback, callbackError) {
        var oldThis = this;
        raml.load(ramlString).then(function(data) {
            try {
                oldThis.convert(data);

                // Validate before invoking callback;
                if (oldThis.validate()) {
                    var sf = oldThis.sampleFile;
                    var env = _.cloneDeep(sf.environment);

                    delete sf.environment;

                    callback(sf, env);
                } else {
                    callback({}, {});
                }

            } catch (err) {
                return callbackError((error.message) ? error.message : error);
            }
        }, function(error) {
            callbackError(((error.message) ? error.message : error));
        });
    },

    parseRaw: function (ramlObject, cb, cbErr) {
        var self = this,
            converted,
            env;
        try {
            self.convert(ramlObject);
            if(self.validate()) {
                converted = self.sampleFile;
                env = _.cloneDeep(converted.environment);
                delete  converted.environment;
                cb(converted, env);
            }
        }
        catch (e) {
            cbErr(e);
        }
    },

    parseFile: function(filename, callback) {
        var oldThis = this;
        raml.loadFile(filename).then(function(data) {
            try {
                oldThis.convert(data);

                // Validate before invoking callback;
                if (oldThis.validate()) {
                    var sf = oldThis.sampleFile;
                    var env = _.cloneDeep(sf.environment);

                    delete sf.environment;

                    callback(sf, env);
                } else {
                    callback({}, {});
                }

            } catch (err) {
                console.error("Could not convert RAML spec: " + error);
            }
        }, function(error) {
            console.error("Could not parse RAML file: " + error);
        });
    },

    convertResource: function(res, parentUri) {
        var oldThis = this;
        var baseUri = parentUri;

        var paramDescription = 'Parameters:\n\n';

        _.forOwn(res.uriParameters, (val, urlParam) => {
            res.relativeUri = res.relativeUri.replace('{' + urlParam + '}', ":" + urlParam);
            this.addEnvKey(urlParam, val.type, val.displayName);

            val.description = val.description || "";
            paramDescription += urlParam + ": " + val.description + '\n\n';

        });

        // Override the parentUri params, if they are specified here additionally.
        // Only new params affect this part. Old params have been converted already.

        _.forOwn(res.baseUriParameters, (val, urlParam) => {
            baseUri = baseUri.replace('{' + urlParam + '}', ":" + urlParam);
            this.addEnvKey(urlParam, val.type, val.displayName);
        });

        // All occurences of baseUriParams have been dealt earlier.
        var resourceUri = baseUri + res.relativeUri;

        if (this.currentFolder.id === this.sampleFile.id) {

            // Top level resource, create another folder, pass the new folder id to the children.
            var folder = {};
            folder.id = this.generateId();
            folder.name = res.relativeUri;
            folder.description = "";
            folder.order = [];
            folder.collection_name = this.sampleFile.name;
            folder.collection_id = this.sampleFile.id;

            // All subResources will access the order array from this obj
            // and push their request id's into it.
            this.currentFolder = folder;
        }

        // Convert own methods.
        _.forEach(res.methods, (req) => {

            // Make a deep copy of the the sampleRequest.
            var request = _.cloneDeep(this.sampleRequest);
            request.collectionId = this.sampleFile.id;

            var headerString = '';
            var queryFlag = false;

            request.description = req.description || "";
            request.description += '\n\n' + paramDescription;

            // // Description can be formatted using Markdown, we don't want lengthy descriptions.
            // if (req.description) {

            //     var len = req.description.length > 2000 ? 2000 : req.description.length;
            //     request.description = req.description.substring(0, len);

            //     if (len > 2000) {
            //         request.description += '...';
            //     }
            // }

            request.id = this.generateId();
            request.method = req.method;

            // No name has been specified, use the complete Uri minus the Base Uri.
            request.name = resourceUri.replace(this.data.baseUri, '');

            request.time = this.generateTimestamp();
            request.url = resourceUri;

            // Headers
            _.forOwn(req.headers, (val, header) => {
              var headerValue = (val.example) ? val.example : "";
              headerString += header + ": " + headerValue + "\n";
            });

            // Query Parameters.
            _.forOwn(req.queryParameters, (val, param) => {
                if (!queryFlag) {
                    request.url += '?';
                } else {
                    request.url += '&';
                }
                request.url += param + '=';
                queryFlag = queryFlag || true;
            });

            // Body
            _.forOwn(req.body, (val, bodyParam) => {

                if (bodyParam === 'application/x-www-form-urlencoded') {
                    request.dataMode = 'urlencoded';
                } else if (bodyParam === 'multipart/form-data') {
                    request.dataMode = 'params';
                } else {
                    request.dataMode = 'raw';

                    // add a Content-Type header.
                    headerString += 'Content-Type: ' + bodyParam + '\n';

                    if (val) {
                        request.rawModeData = val.example || "";
                    }

                    // Deal with schemas later, show example for now.
                    // // Only JSON schemas can be parsed. Schema has to be specified.
                    // if (bodyParam === 'application/json' && val.schema) {
                    //     request.rawModeData = JSON.stringify(this.schemaToJSON(JSON.parse(val.schema)));
                    // } else {
                    //     // If schema isn't present or if the data type is not json
                    //     request.rawModeData = val.example || "";
                    // }
                }

                // Haven't found a way to upload files in the raml spec.
                if (request.dataMode === 'urlencoded' || req.dataMode === 'multipart/form-data') {
                    // val can be null. we need to skip it if it is.
                    val && _.forOwn(val.formParameters, (value, param) => {
                        var obj = {};
                        obj[param] = '';
                        request.data.push(obj);
                    });
                }
            });

            request.headers = headerString;
            this.sampleFile.requests.push(request);
            this.currentFolder.order.push(request.id);
        });

        // Convert child resources.
        _.forEach(res.resources, (subRes) => {
            this.convertResource(subRes, resourceUri);
        });

        // Check if the current resource is a top level resource.
        if (parentUri === this.data.baseUri) {

            // If there is only 1 request in the current folder, why create a folder?
            if (this.currentFolder.order.length > 1) {

                // All the requests in the top level resource have been processed.
                this.sampleFile.folders.push(this.currentFolder);
            } else {

                // Add the request to the order property.
                this.sampleFile.order.push(this.currentFolder.order[0]);
            }

            // Reset the currentFolder to the collection id.
            this.currentFolder = {
                id: oldThis.sampleFile.id
            };
        }
    },

    schemaToJSON: function(schema) {
        var obj;
        var oldThis = this;
        switch (schema.type) {
            case 'object':
                obj = {};

                // For each property, repeat the same thing
                _.forOwn(schema.properties, (val, item) => {
                    obj[item] = this.schemaToJSON(val);
                });

                break;
            case 'array':
                obj = [];

                // return the populated array
                if (schema.items) {
                    schema.items.forEach(function(value) {
                        obj.push(oldThis.schemaToJSON(value));
                    });
                }

                break;
            case 'boolean':
            case 'integer':
            case 'number':
            case 'string':
                obj = "";
                break;
        }
        return obj;
    },

    _modifyTraits: function() {
        // Make the traits property more accessible.
        this.data.traits = _.reduce(this.data.traits, (acc, trait) => {
            _.forOwn(trait, (val, key) => {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    _modifySchemas: function() {
        this.data.schemas = _.reduce(this.data.schemas, (acc, schema) => {
            _.forOwn(schema, (val, key) => {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    _modifyResourceTypes: function() {
        this.data.resourceTypes = _.reduce(this.data.resourceTypes, (acc, resourceType) => {
            _.forOwn(resourceType, (val, key) => {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    addEnvKey: function(key, type, displayName) {
        if (!_.has(this.env, key)) {
            var envObj = {};
            envObj.name = displayName || key;
            envObj.enabled = true;
            envObj.value = "";
            envObj.type = type || "string";
            envObj.key = key;

            this.env[key] = envObj;
        }
    },

    convert: function(data) {

        this.data = data;

        // Modify the data to make it an indexed collection.
        this._modifyTraits();
        this._modifySchemas();
        this._modifyResourceTypes();

        // Initialize the spec.
        //var file = './postman-boilerplate.json';
        this.sampleFile = JSON.parse('{"environment":{"values":[],"name":"","id":"","timestamp":0},"folders":[{"id":"","name":"","description":"","order":[],"collection_name":"","collection_id":""}],"id":"","name":"New Collection","order":[],"requests":[{"collectionId":"","dataMode":"params","descriptionFormat":"html","description":"","data":[],"headers":"","id":"","method":"","name":"","preRequestScript":"","pathVariables":{},"responses":[],"synced":false,"tests":"","time":0,"url":""}],"synced":false,"timestamp":0}');

        var sf = this.sampleFile;

        // Collection trivia
        sf.id = this.generateId();
        sf.timestamp = this.generateTimestamp();

        // Cache sampleRequest
        this.sampleRequest = sf.requests[0];
        sf.requests = [];

        sf.name = data.title || DEFAULT_NAME;

        // Temporary, will be populated later.
        sf.folders = [];

        sf.environment.name = (sf.name) + "'s Environment";
        sf.environment.timestamp = this.generateTimestamp();
        sf.environment.id = this.generateId();

        // BaseURI Conversion
        _.forOwn(this.data.baseUriParameters,(val, param) => {
            // Version will be specified in the baseUriParameters
            this.data.baseUri = this.data.baseUri.replace("{" + param + "}", ":" + param);

            this.addEnvKey(param, val.type, val.displayName);
        });

        // Convert schemas to objects.
        // Will be parsed later.
        var sc = this.data.schemas;

        // _.forOwn(sc, function(val, schema) {
        //     val = this.schemaToJSON(JSON.parse(val));
        // }, this);

        _.forEach(this.data.resources, (resource) => {
            // Initialize the currentFolder
            this.currentFolder.id = sf.id;

            // Top Level conversion.
            this.convertResource(resource, this.data.baseUri);
        });

        //Add the environment variables.
        _.forOwn(this.env, (val) => {
            sf.environment.values.push(val);
        });

        if (!this.group) {

            // Copy over the ids in the order field of each folder
            // to the global order field

            _.forEach(sf.folders, (folder) => {
                _.forEach(folder.order, (ord) => {
                    sf.order.push(ord);
                });
            });

            // If grouping is disabled, reset the folders.
            sf.folders = [];
        }
    },

    _convert: function(inputFile, options, cb) {
        var file = path.resolve(__dirname, inputFile);

        this.group = options.group;

        // Set to true to generate test file.
        this.test = options.test;

        this.parseFile(file, cb);
    },

    generateId: function() {
        if (this.test) {
            return "";
        } else {
            return uuidv4();
        }
    },

    generateTimestamp: function() {
        if (this.test) {
            return 0;
        } else {
            return Date.now();
        }
    },

    validate: function() {

        if (validator.validateJSON('c', this.sampleFile).status) {
            console.log('The conversion was successful');
            return true;
        } else {
            console.log("Could not validate generated file");
            return false;
        }
    },

    // Callback will be invoked with a boolean value indicating the validity.
    isValid: function(str, callback) {

        var later = function() {
            callback(true);
        };

        var error = function() {
            callback(false);
        }

        // Title is a required property.
        if (str.indexOf('title:') > 0) {
            raml.load(str).then(later, error);
        } else {
            raml.loadFile(str).then(later, error);
        }
    }
};

module.exports = converter;
