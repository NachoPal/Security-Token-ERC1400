pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;


/** @title CertificateController */
contract CertificateController {

    //------------------ STATE VARIABLES ---------------------

    bytes constant internal PREFIX = "\x19Ethereum Signed Message:\n32";
    bytes32 constant internal NONCES_MAPPING_POSITION_CONTROLLER = keccak256("certificate.controller.mapping.nonce");

    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
    }


    //------------------ EXTERNAL ---------------------

    /** @dev Check if certificate is valid
      * @param controllerData certificate
      * @param newController controller to be authorised or revoked
      * @param controllers valid token's controllers
      */
    function register(
    		bytes calldata controllerData,
        address newController,
        address[] calldata controllers
  	)
    		external
    		returns (bytes32)
  	{

  		(bytes memory certificate, bytes32 certificateHash, Signature memory signature) = abi.decode(
          controllerData,
          (bytes, bytes32, Signature)
      );

      (
          address newControllerCert,
          address tokenCert,
          uint256 nonceCert
      ) = abi.decode(certificate, (address, address, uint256));

      if(address(this) != tokenCert){
          return "invalid certificate (token)";
      }

      if(newController != newControllerCert) {
          return "invalid certificate (params)";
      }

      if(_nonce() != nonceCert) {
          return "invalid certificate (nonce)";
      }

      bytes32 prefixedHash = keccak256(abi.encodePacked(PREFIX, certificateHash));

      for(uint256 i=0; i < controllers.length; i++) {
          if(ecrecover(prefixedHash, signature.v, signature.r, signature.s) == controllers[i]) {
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
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_CONTROLLER));
        assembly {
            sstore(position, nonce)
        }
    }

    /** @dev Get next valid certificate nonce */
    function _nonce() internal view returns(uint256 nonce) {
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_CONTROLLER));
        assembly {
            nonce := sload(position)
        }
    }
}
