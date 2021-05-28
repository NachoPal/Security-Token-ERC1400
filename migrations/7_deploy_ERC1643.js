var ERC1643 = artifacts.require("./ERC1643.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    ERC1643
  );
};
