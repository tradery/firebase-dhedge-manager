const chai = require('chai')
const expect = chai.expect;
const aave = require('../libs/aave');

describe("aave constants", () => {

    it("maxLeverage should be a number greater than 1", () => {
        expect(aave.maxLeverage > 1).to.be.true;
    });

    it("liquidationHealthFloor should be at least 1.08", () => {
        expect(aave.liquidationHealthFloor >= 1.08).to.be.true;
    });

    it("liquidationHealthTargetFloor should be at least 1.25", () => {
        expect(aave.liquidationHealthTargetFloor >= 1.25).to.be.true;
    });

    it("liquidationHealthTargetCeiling should be at least 1.35", () => {
        expect(aave.liquidationHealthTargetCeiling >= 1.35).to.be.true;
    });

    it("liquidationHealthTargets should be at least than 8% apart", () => {
        expect(aave.liquidationHealthTargetCeiling / aave.liquidationHealthTargetFloor >= 1.08).to.be.true;
    });

    it("liquidationHealthTargetCeiling should be greater than liquidationHealthTargetFloor", () => {
        expect(aave.liquidationHealthTargetCeiling > aave.liquidationHealthTargetFloor).to.be.true;
    });
});

describe("aave isDebtSufficientlyRepaid", () => {
    
    it("should be true if there is no debt", () => {
        expect(aave.isDebtSufficientlyRepaid(
            {
                'aave': {
                    'variable-debt': {},
                    'liquidationHealth': 1.5
                }
            },
            1,
            null
        )).to.be.true;
    });

    it("should be true if liquidationHealth is null", () => {
        expect(aave.isDebtSufficientlyRepaid(
            {
                'aave': {
                    'variable-debt': {
                        'notEmpty': true
                    },
                    'liquidationHealth': null
                }
            },
            1,
            null
        )).to.be.true;
    });

    it("should be true if liquidationHealthTarget is not null, leverage is gte the max, and liquidationHealth is gte the liquidationHealthTarget", () => {

        const assets = {
            'aave': {
                'variable-debt': {
                    'notEmpty': true
                },
                'liquidationHealth': 1.5,
                'leverage': 2.5,
            }
        };

        expect(aave.isDebtSufficientlyRepaid(
            assets, 2.5, 1
        )).to.be.true;

        expect(aave.isDebtSufficientlyRepaid(
            assets, 2.4, 1
        )).to.be.false;

        expect(aave.isDebtSufficientlyRepaid(
            assets, 2.5, 2
        )).to.be.false;
    });

});
