var Utils = artifacts.require("./Utils.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    Utils
  );
};
