var ERC20 = artifacts.require("./ERC20.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    ERC20
  );
};
