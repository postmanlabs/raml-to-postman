var expect = require('chai').expect,
  Converter = require('../../index.js'),
  fs = require('fs'),
  VALID_RAML_DIR_PATH = './test/fixtures/valid-raml';

describe('CONVERT FUNCTION TESTS ', function() {
  describe('The converter should convert the input with different types', function() {
    it('(type: string)', function (done) {
      var data = fs.readFileSync(VALID_RAML_DIR_PATH + '/api.raml').toString(),
        input = {
          data: data,
          type: 'string'
        };

      Converter.convert(input, {}, function(err, result) {
        expect(err).to.be.null;
        expect(result.result).to.equal(true);
        expect(result.output[0].type).to.equal('collection');
        expect(result.output[0].data).to.have.property('requests');
        expect(result.output[0].data.requests).to.have.lengthOf(4);
        done();
      });
    });

    it('(type: file)', function (done) {
      var input = {
        data: VALID_RAML_DIR_PATH + '/api.raml',
        type: 'file'
      };

      Converter.convert(input, {}, function(err, result) {
        expect(err).to.be.null;
        expect(result.result).to.equal(true);
        expect(result.output[0].type).to.equal('collection');
        expect(result.output[0].data).to.have.property('requests');
        expect(result.output[0].data.requests).to.have.lengthOf(4);
        done();
      });
    });
  });

  it('The converter should convert raml spec to postman collection ' +
      'with remote references present', function(done) {
    Converter.convert({
      type: 'file',
      data: VALID_RAML_DIR_PATH + '/remoteRefs.raml'
    }, {}, (err, conversionResult) => {
      expect(err).to.be.null;
      expect(conversionResult.result).to.equal(true);
      expect(conversionResult.output.length).to.equal(2);
      expect(conversionResult.output[0].type).to.equal('collection');
      expect(conversionResult.output[1].type).to.equal('environment');

      collectionJSON = conversionResult.output[0].data;
      expect(collectionJSON).to.be.an('object');
      expect(collectionJSON).to.have.property('requests');
      expect(collectionJSON.requests).to.have.lengthOf(46);
      expect(collectionJSON.requests[0].name).to.eql('/testcase');
      expect(collectionJSON.requests[0].method).to.eql('post');
      expect(collectionJSON.requests[0].rawModeData).to.eql('Could not resolve "testcase_post.example"');
      done();
    });
  });
});
