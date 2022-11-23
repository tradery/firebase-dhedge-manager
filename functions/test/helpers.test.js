const chai = require('chai');
const expect = chai.expect;
const helpers = require('../libs/helpers');

describe("helpers countDecimals()", () => {
    
    it("should return 0 for non-numbers", () => {
        expect(helpers.countDecimals(null) === 0).to.be.true;
        expect(helpers.countDecimals(undefined) === 0).to.be.true;
        expect(helpers.countDecimals(NaN) === 0).to.be.true;
        expect(helpers.countDecimals(Infinity) === 0).to.be.true;
    });

    it("should return 3 when there are three decimals", () => {
        expect(helpers.countDecimals(0.123) === 3).to.be.true;
        expect(helpers.countDecimals('0.123') === 3).to.be.true;
    });

    it("should return 0 when there are multiple zeros after a decimal", () => {
        expect(helpers.countDecimals(1.000000) === 0).to.be.true;
    });

    it("should return 0 for ints", () => {
        expect(helpers.countDecimals(123) === 0).to.be.true;
        expect(helpers.countDecimals('123') === 0).to.be.true;
    });

    it("should return properly when using scientific notation", () => {
        expect(helpers.countDecimals(1.01e40) === 0).to.be.true;
        expect(helpers.countDecimals(5e-60) === 60).to.be.true;
        expect(helpers.countDecimals('5e-60') === 60).to.be.true;
    });

});

describe("helpers numberToSafeString()", () => {
    
    it("should return '0' for non-numbers", () => {
        expect(helpers.numberToSafeString(null) === '0').to.be.true;
        expect(helpers.numberToSafeString(undefined) === '0').to.be.true;
        expect(helpers.numberToSafeString(NaN) === '0').to.be.true;
        expect(helpers.numberToSafeString(Infinity) === '0').to.be.true;
    });

    it("should work for small ints and floats", () => {
        expect(helpers.numberToSafeString(123) === '123').to.be.true;
        expect(helpers.numberToSafeString(0.123) === '0.123').to.be.true;
        expect(helpers.numberToSafeString('0.123') === '0.123').to.be.true;
        expect(helpers.numberToSafeString('12345678.12345678') === '12345678.12345678').to.be.true;
    });

    it("should work for huge positive ints", () => {
        expect(helpers.numberToSafeString('1000000000000000000000000000000') === '1000000000000000000000000000000').to.be.true;
        expect(helpers.numberToSafeString(1000000000000000000000000000000) === '1000000000000000000000000000000').to.be.true;
        expect(helpers.numberToSafeString(1e+30) === '1000000000000000000000000000000').to.be.true;
        expect(helpers.numberToSafeString('1e+30') === '1000000000000000000000000000000').to.be.true;
    });

    it("should work for tiny floats", () => {
        expect(helpers.numberToSafeString('0.0000000000000000000000000000001') === '0.0000000000000000000000000000001').to.be.true;
        expect(helpers.numberToSafeString(0.0000000000000000000000000000001) === '0.0000000000000000000000000000001').to.be.true;
        expect(helpers.numberToSafeString(1e-31) === '0.0000000000000000000000000000001').to.be.true;
        expect(helpers.numberToSafeString('1e-31') === '0.0000000000000000000000000000001').to.be.true;
    });

    it("should work for large complex numbers", () => {
        expect(helpers.numberToSafeString(2.077296479142265e-21) === '0.000000000000000000002077296479142265').to.be.true;
        expect(helpers.numberToSafeString(2.077296479142265e+21) === '2077296479142265000000').to.be.true;
    });

});
