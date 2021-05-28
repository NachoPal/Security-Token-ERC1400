var CertificateController = artifacts.require("./CertificateController.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    CertificateController
  );
};
