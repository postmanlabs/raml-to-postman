var converter = require('./lib/convert'),
    async = require('async'),
    ramlParser = require('raml-parser'),
    importer,
    _ = require('lodash'),
    fs = require('fs');

/**
 *
 * @param {Array} files - Arrray of file paths
 * @returns {Array} - Array of RAML 0.8 root files
 */
function guessRoot (files) {
    var rootFiles = [],
        validationResult;
  
    _.forEach(files, (file) => {
        validationResult = importer.validate({ type: 'file', data: file.fileName });
        if (validationResult.result) {
            rootFiles.push({
                fileName: file.fileName,
                data: validationResult.data
            });
        }
    });
  
    return rootFiles;
}

/**
 * 
 * @param {String} data - RAML 1.0 spec
 * @returns {Object} - format {result: boolean, reason: string}
 */
function validateRAML (data) {
    // check if it starts with #%RAML 0.8
    if (data.startsWith('#%RAML 0.8')) {
        // title property is a must for RAML0.8 specs
        // most of the specs have title: in the second line itself
        // hence to avoid splitting the whole file by newline and then checking for title field
        if (data.startsWith('#%RAML 0.8\ntitle:')) {
            return { result: true, data };
        }
        else {
            let dataArray = data.split('\n'),
            titleExist = _.find(dataArray, (element) => {
                return element.trim().startsWith('title:');
            })
            if (titleExist) {
                return { result: true, data }
            }
            else {
                return {
                    result: false,
                    reason: 'RAML 0.8 specification must have title property'
                }
            }
        }
    }
    else {
        return {
            result: false,
            reason: 'RAML 0.8 specification must have #%RAML 0.8 at beginning of the file'
        }
    }
};

importer = {
    getOptions: function() {
        return [];
    },
    convert: function(input, options, callback) {
        // this function will be called by parseString function if conversion was successful
        var success = (collection, environment) => {
            return callback(null, {
                result: true,
                output: [
                    {
                        type: 'collection',
                        data: collection
                    },
                    {
                        type: 'environment',
                        data: environment
                    }
                ]
            });
        },
        // this function will be called by parseString function if conversion failed
        failure = (error) => {
            if(typeof error === 'string' && error.includes('cannot fetch')) {
                return callback({
                    result: false,
                    reason: 'External references are not supported yet. ' + error
                });
            }
            return callback({
                result: false,
                reason: error
            });
        };
        if (input.type === 'file') {
            try {
                data = fs.readFileSync(input.data).toString();
            }
            catch (e) {
                return callback({
                    result: false,
                    reason: e.message
                });
            }
            converter.parseString(data, success, failure);
        }
        else if(input.type === 'string') {
            converter.parseString(input.data, success, failure)
        }
        else if (input.type === 'folder') {
            var rootSpecs = guessRoot(input.data),
                allFiles = _.map(input.data, 'fileName'),
                convertedSpecs = [];

            if (_.isEmpty(rootSpecs)) {
                return callback(null, {
                    result: false,
                    reason: 'Imported folder does not contain Root of the RAML 0.8 Specs.'
                });
            }
            else if (rootSpecs.length > 1) {
                return callback(null, {
                    result: false,
                    reason: 'Imported folder contains multiple Root of the RAML 0.8 Specs.'
                });
            }

            async.each(rootSpecs, (rootSpec, cb) => {
                var reader = new ramlParser.FileReader(function (path) {
                        return new Promise(function (resolve, reject) {
                            var decodedFullPath = decodeURIComponent(path);

                            if (_.includes(allFiles, decodedFullPath) && fs.existsSync(decodedFullPath)) {
                                resolve(fs.readFileSync(decodedFullPath).toString());
                            }
                            else if (_.includes(allFiles, rootSpec.fileName + path) && fs.existsSync(rootSpec.fileName + path)) {
                                resolve(fs.readFileSync(rootSpec.fileName + path).toString());
                            }
                            else {
                                reject(new Error('Unable to find file ' + path + ' in uploaded data'));
                            }
                        });
                    });

                ramlParser.loadFile(rootSpec.fileName, { reader: reader })
                    .then(function (result) {
                        converter.parseRaw(result, function (collection, environment) {
                            convertedSpecs.push(
                                {
                                    type: 'collection',
                                    data: collection
                                },
                                {
                                    type: 'environment',
                                    data: environment
                                }
                            );
                            cb(null);
                        }, function (errorMessage) {
                            cb(errorMessage);
                        });
                    })
                    .catch(function (e) {
                        cb(e);
                    });
            }, (err) => {
                if (err) {
                    return callback(null, {
                        result: false,
                        reason: _.toString(err)
                    });
                }

                return callback(null, {
                    result: true,
                    output: convertedSpecs
                });
            });
        }
        else {
            return callback({
                result: false,
                reason: 'input type: ' + input.type + ' is not valid'
            });
        }
    },
    validate: function(input) {
        let data, rootFiles;
        if (input.type === 'file') {
            try {
                data = fs.readFileSync(input.data).toString();
            }
            catch (e) {
                return {
                    result: false,
                    reason: e.message
                };
            }
            data = data.trim();
            return validateRAML(data);
        }
        else if(input.type === 'string') {
            data = input.data.trim();
            return validateRAML(data);
        }
        else if (input.type === 'folder') {
            rootFiles = guessRoot(input.data);
            if (_.isEmpty(rootFiles)) {
              return {
                result: false,
                reason: 'Imported folder does not contain Root of the RAML 1.0 Specs.'
              };
            }
            return {
                result: true,
                data: rootFiles[0].data
            };
        }
        else {
            return { 
                result: false,
                reason: 'input type: ' + input.type + ' is not valid'
            };
        }
    },

    getMetaData: function(input, callback) {
        var validation = importer.validate(input);
        converter.getMetaData(validation.data, callback);
}
};

module.exports = importer;