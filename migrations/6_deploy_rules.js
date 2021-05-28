var Rules = artifacts.require("./Rules.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    Rules
  );
};
