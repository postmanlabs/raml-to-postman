var converter = require('./lib/convert'),
    fs = require('fs'),
    yaml = require('js-yaml');
module.exports = {
    getOptions: function() {
        return [];
    },
    convert: function(input, options, callback) {
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
            data = fs.readFileSync(input.data).toString();
            converter.parseString(data, success, failure);
        }
        else if(input.type === 'string') {
            converter.parseString(input.data, success, failure)
        }
        else {
            return callback({
                result: false,
                reason: 'input type: ' + input.type + ' is not valid'
            });
        }
    },
    validate: function(input) {
        let data;
        if (input.type === 'file') {
            data = fs.readFileSync(input.data).toString();
            data = data.trim();
            if (data.startsWith('#%RAML 0.8')) {
                data = yaml.safeLoad(data);
                return { result: typeof data === 'object' && data.hasOwnProperty('title') };
            }
            return { result: false };
        }
        else if(input.type === 'string') {
            data = input.data.trim();
            if (data.startsWith('#%RAML 0.8')) {
                data = yaml.safeLoad(data);
                return { result: typeof data === 'object' && data.hasOwnProperty('title') };
            }
            return { result: false };
        }
        else {
            return { 
                result: false,
                reason: 'input type: ' + input.type + ' is not valid'
            };
        }
    }
}