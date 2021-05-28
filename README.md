# Requirements
  * Truffle 5.0.7
  * Ganache-cli 6.3.0 (ganache-core: 2.4.0)

# Set Up
  * `$ npm install`
  * `$ npm run chain`
  * `$ npm run test`

# ERC1400 Standard
* This Security Token follows the ERC1400 standard: https://github.com/ethereum/EIPs/issues/1411

* All ERC1400's methods should be implemented with the exception of those which are meant to be called directly by token holders. The Company is the custodian of investor's private key, subsequently they are not able to call any method where `msg.sender` should correspond to token holder's public address.

* ERC20 methods `transfer`,  `transferFrom`, `approve` and `allowance` have not been implemented either.

# Actors
### Issuer
* The Company.
* Deploys all the contracts and becomes their owner.
* **Issuances** and **Redemptions**.
* Rights for removing and attaching documents.
* Authorise/Revoke _Controllers_ and _Operators_.
* Whitelist/KYC and Blacklist/UnKYC _Investors_.
* Sets `Rules.sol` contract address to be used by the token.
* Can eventually renounce issuance, making impossible to issue tokens again.
* Sets NAV and Lot Size parameters.
* Sets Default Partitions.

### Operators
* The Company and eventually a third party exchange platform.
* **Transfers**.
* Have to be authorised for EACH _Investor_ by _Issuer_.
* Once they are authorised, they are able to transfer ANY token partition on investor's behalf.

### Controllers
* Fund administrator and its managers.
* There should be at least two of them.
* They are able to force **Transfers** and **Redemptions** even when lockup periods have not expired yet or lot size rule is not met.
* Every action must include a certificate making use of `bytes controllerData` function param. The certificate is signed off-chain by another controller.
* Rights for removing and attaching documents.

### Investor / Token holder
* They do not keep their own private keys.
* All their actions (ask for issuance, transfers, redemptions) are recorded off-chain and executed on-chain by _Operator_ or _Issuer_ every 24h.


# Architecture
![Architecture](/architecture.jpg)

### SecurityToken.sol
* Proxy where all methods calls are forwarded via `delegatecall()` to the different ERC Security Token Standard contracts.
* Inherits from `ERC1400.sol` contract.
* During deployment has to enforce that at least two controllers are set.

### ERC1400.sol
* Contains all Security Token state variables.
* Inherits from `Controllable.sol` contract.

### Controllable.sol
* _Controllers_ management.
* A _Controller_ can not be revoked if the total number of controllers goes under 2.
* Makes use of `CertificateController.sol`.
* Inherits from `Ownable.sol` contract.

### Ownable.sol
* Sets token owner (_Issuer_) in its `constructor()`.
* _Issuer_ management.

### ERC Security Token Standards
* `ERC20.sol`, `ERC1644.sol`, `ERC1643.sol`, `ERC1594.sol` and `ERC1410.sol`.
* Implement different standard methods from ERC1400 standard.
* Are called by `SecurityToken.sol` via `delegatecall()`.
* Inherit from `ERC1400.sol`, so that they are able to store/read from token's storage and also have access to `Ownable.sol` and `Controllable.sol` methods.
* Sometimes they have to communicate with each other via `delegatecall()`.
* All **Transfer** or **Redeem** methods where partition is not specified, will iterate over `_tokenDefaultPartitions` state variable.
* **Issue** methods where partition is not specified, will take `_tokenDefaultPartitions[0]` as partition to issue.

### Partitions.sol
* Independent contract with its own storage.
* Owned/Related to a single token: `setToken(address tokenContract)`.
* It stores 3 main elements:
  1. Existing token's **partitions**
  2. Valid **variables** for ALL existing partitions.
  3. Variables **values** for EACH partition.
* Makes use of unstructured storage, where partition variables values are stored as follows:
  ```
  bytes32 position = keccak256(abi.encodePacked(partition, key));
  assembly { sstore(position, value) }
  ```
* Partitions can be added and removed.
* Variables are a struct formed by its **key** and its **kind** ('type' word is reserved in Solidity);
  ```
  { key: "lockupExpirationRedemptionKey" (bytes32), kind: "uint256" (string) }
  ```
* Variables can be added, but not removed.
* Values can be set buy not removed (they have to be set to 0).
* When `totalSupplyByPartition(partition) == 0`, `partition` has to be removed and all its values set to 0.
* Only related token is allowed to perform this action: `removePartition(bytes32 partition) onlyToken`.

### Rules.sol
* Contract without storage called by ERC standard contracts via `call()`.
* Logic-only contract where different rules are applied to make sure **Issuances**, **Transfers**, and **Redemptions** are possible.
* Communicates via `call()` with `SecurityToken.sol` and `Partition.sol` to get required state variables values needed to apply the rules.
* Returns **ERC1066** standard reason codes + own codes.

  | Code | Reason                           |
  |:----:|:---------------------------------|
  |0x50  |transfer failure                  |
  |0x51  |transfer success                  |
  |0x52  |insufficient balance              |
  |0x53  |insufficient allowance            |
  |0x54  |transfers halted (contract paused)|
  |0x55  |funds locked (lockup period)      |
  |0x56  |invalid sender                    |
  |0x57  |invalid receiver                  |
  |0x58  |invalid value                     |
  |0x59  |partition does not exist          |
  |0x60  |invalid transfer lot size         |
  |0x61  |invalid issuance (amount)         |
  |0x62  |invalid issuance (granularity)    |
  |0x63  |token not issuable                |


### CertificateToken.sol
* Logic-only contract called by `ERC1644.sol` via `delegatecall()`.
* Checks if a Certificate includes correct parameters and if they have been signed by ANOTHER authorised _Controller_.
* This Certificate must be included as `bytes controllerData` param every time `controllerTransferByPartition()`, `controllerTransfer()`, `controllerRedeemByPartition()` or `controllerRedeem()` methods are called.
* Certificate is formed by:
![Certificate](/certificate.jpg)

* Current `nonce` value is stored in `SecurityToken.sol` making use of unstructured storage.
  ```
  bytes32 constant internal NONCES_MAPPING_POSITION_TOKEN = keccak256("certificate.token.mapping.nonce");
  bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_TOKEN));
        assembly {
            nonce := sload(position)
        }
  ```
* **Certificate generation** (off-chain)
  1. Parameters are ABI encoded forming the certificate:
      ```javascript
      const certificate = web3.eth.abi.encodeParameters(
        [
          'bytes32',
          'address[]',
          'uint256[]'
        ],
        [
          params.partition,
          [params.token, params.from, params.to],
          [params.value, params.nonce]
        ]
      );
      ```
  2. Get certificate hash:
      ```javascript
      const certificateHash = web3.utils.keccak256(certificate);
      ```
  3. Sign certificate hash (ECDSA):
      ```javascript
      const signedCertificate = await web3.eth.sign(
        certificateHash,
        params.controller
      );
      ```
  4. Get signature parameters:
      ```javascript
      const signature = getSignatureParameters(signedCertificate);
      ```
  5. ABI encode signature, certificate, and certificate hash:
      ```javascript
      const controllerData = web3.eth.abi.encodeParameters(
        [
          'bytes',
          'bytes32',
          {"Signature": {
            "r": 'bytes32',
            "s": 'bytes32',
            "v": 'uint8'
          }}
        ],
        [
          certificate,
          certificateHash,
          signature
        ]
      );
      ```
* **Certificate validation** (on-chain)
  1. ABI decode `bytes controllerData` to get certificate, certificate hash and signature:
      ```
      (bytes memory certificate, bytes32 certificateHash, Signature memory signature) = abi.decode(
          controllerData,
          (bytes, bytes32, Signature)
      );
      ```
  2. ABI decode certificate to get all parameters:
      ```
      //tokenCert = addressCert[0]
      //fromCert  = addressCert[1]
      //toCert    = addressCert[2]
      //valueCert = uintCert[0]
      //nonceCert = uintCert[1]

      (
          bytes32 partitionCert,
          address[] memory addressCert,
          uint256[] memory uintCert
      ) = abi.decode(certificate,(bytes32, address[], uint256[]));
      ```
  3. Validate decoded values comparing them with method parameters.

  4. Read from storage if `nonce` is valid:
      ```
      function _nonce() internal view returns(uint256 nonce) {
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_TOKEN));
        assembly {
            nonce := sload(position)
        }
      }
      ```
  5. Validate signature (ECDSA recover) and increase the `nonce`:
      ```
      bytes constant internal PREFIX = "\x19Ethereum Signed Message:\n32";

      for(uint256 i=0; i < controllers.length; i++) {
          if(ecrecover(prefixedHash, signature.v, signature.r, signature.s) == controllers[i] && address(msg.sender) != controllers[i]) {
              _increaseNonce();
              return bytes32(0);
          }
      }
      ```

### CertificateController.sol
* Same concept than `CertificateToken.sol`.
* Every time the _Issuer_ wants to authorise or revoke a _Controller_, the action has to be signed by a _Controller_.
