var Partitions = artifacts.require("./Partitions.sol");
//const seedingDevelopment = require('../test/helpers/seed');
const seedingDevelopment = require('../test/helpers/seed_rinkeby');
const seedingRinkeby = require('../test/helpers/seed_rinkeby');

module.exports = function(deployer, network, accounts) {
  if(network != 'security_node') {
    let seeding = null
    console.log(network)
    if(network == 'development') {
      seeding = seedingDevelopment
    } else {
      seeding = seedingRinkeby
    }

    const seed = seeding.run(accounts);

    deployer.deploy(
      Partitions,
      seed.partitionVariables,
      seed.partitionValues
    );
  }
};
