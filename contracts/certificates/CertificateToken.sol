pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;


/** @title CertificateToken */
contract CertificateToken {

    //------------------ STATE VARIABLES ---------------------

    bytes constant internal PREFIX = "\x19Ethereum Signed Message:\n32";
    bytes32 constant internal NONCES_MAPPING_POSITION_TOKEN = keccak256("certificate.token.mapping.nonce");

  	struct Signature {
    		bytes32 r;
    		bytes32 s;
        uint8 v;
  	}


    //------------------ EXTERNAL ---------------------

    /** @dev Check if certificate is valid
      * @param controllerData certificate
      * @param partition .
      * @param from .
      * @param to .
      * @param value .
      * @param controllers valid token's controllers
      */
    function register(
    		bytes calldata controllerData,
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        address[] calldata controllers
  	)
    		external
    		returns (bytes32)
  	{

  		(bytes memory certificate, bytes32 certificateHash, Signature memory signature) = abi.decode(
          controllerData,
          (bytes, bytes32, Signature)
      );

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

      if(address(this) != addressCert[0]){
        return "invalid certificate (token)";
      }

      if(partition != partitionCert || from != addressCert[1] || to != addressCert[2] || value != uintCert[0]) {
          return "invalid certificate (params)";
      }

      if(_nonce() != uintCert[1]) {
          return "invalid certificate (nonce)";
      }

      bytes32 prefixedHash = keccak256(abi.encodePacked(PREFIX, certificateHash));

      for(uint256 i=0; i < controllers.length; i++) {
          if(ecrecover(prefixedHash, signature.v, signature.r, signature.s) == controllers[i] && address(msg.sender) != controllers[i]) {
              _increaseNonce();
              return bytes32(0);
          }
      }

      return "invalid certificate (controller)";
  	}


    //------------------ INTERNAL ---------------------

    /** @dev Increase the certificate nonce */
    function _increaseNonce() internal {
        uint256 nonce = _nonce() + 1;
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_TOKEN));
        assembly {
            sstore(position, nonce)
        }
    }

    /** @dev Get next valid certificate nonce */
    function _nonce() internal view returns(uint256 nonce) {
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_TOKEN));
        assembly {
            nonce := sload(position)
        }
    }
}
