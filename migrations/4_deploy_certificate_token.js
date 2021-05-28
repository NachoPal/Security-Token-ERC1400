var CertificateToken = artifacts.require("./CertificateToken.sol");

module.exports = function(deployer, network, accounts) {

  deployer.deploy(
    CertificateToken
  );
};
