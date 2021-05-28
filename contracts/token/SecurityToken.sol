pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import './ERC1400.sol';

/** @title SecurityToken standard */
/** @author Ignacio Palacios Santos */

contract SecurityToken is ERC1400 {

    /** @dev Constructor:
      * @param tokenDetails struct with basic token values
      * @param controllers array of authorized controllers
      * @param documents array of structs with docuemnts info
      * @param defaultPartitions .
      * @param operators array of authorized operators
      * @param contracts array of all needed contract addresses
      */
    constructor(
      ERC20details memory tokenDetails,
      address[] memory controllers,
      Document[] memory documents,
      bytes32[] memory defaultPartitions,
      address[] memory operators,
      address[] memory contracts
    )
        public
    {
      _rules = contracts[0];
      _partitions = contracts[1];
      _certificateToken = contracts[2];
      _certificateController = contracts[3];
      _erc1643 = contracts[4];
      _erc1594 = contracts[5];
      _erc1410 = contracts[6];
      _erc1644 = contracts[7];
      _erc20 = contracts[8];

      //ERC1410 Initialization
      (bool validErc1410, /*bytes memory returnData*/) = address(_erc1410).delegatecall(
          abi.encodeWithSignature(
            "initialize(bytes32[],address[])",
            defaultPartitions, operators
          )
      );

      require(validErc1410, "ERC1410 initialization failed");

      //ERC1643 Initialization
      (bool validErc1643, /*bytes memory returnData*/) = address(_erc1643).delegatecall(
          abi.encodeWithSignature(
            "initialize((bytes32,string,bytes32,uint256,uint256)[])",
            documents
          )
      );

      require(validErc1643, "ERC1643 initialization failed");

      //ERC20 Initialization
      (bool validErc20, /*bytes memory returnData*/) = address(_erc20).delegatecall(
          abi.encodeWithSignature(
            "initialize((string,string,uint8,uint256,uint8,uint256))",
            tokenDetails
          )
      );

      require(validErc20, "ERC20 initialization failed");

      //Controllable Initialization
      require(controllers.length >= 2, "should be at least two controllers");
      _controllersList = controllers;

      for(uint i=0; i < controllers.length; i++) {
          require(controllers[i] != address(0), "invalid 0x00 address");
          _controllers[controllers[i]] = true;
          emit ControllerAuthorized(msg.sender, controllers[i]);
      }
    }

    /** @dev Fallback as proxy */
    function () external {

        address erc;

        for(uint256 i=0; i < 1; i++) {
            //---------------- EXTERNAL & PUBLIC ----------------
            //ERC1410
            if(
                msg.sig == bytes4(keccak256("operatorTransferByPartitionAndBatches((bytes32,address,address,uint256,bytes,bytes)[])")) ||
                msg.sig == bytes4(keccak256("operatorTransferByPartition(bytes32,address,address,uint256,bytes,bytes)")) ||
                msg.sig == bytes4(keccak256("issueByPartition(bytes32,address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("issueByPartitionAndBatches((bytes32,address,uint256,bytes)[])")) ||
                msg.sig == bytes4(keccak256("operatorRedeemByPartition(bytes32,address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("operatorRedeemByPartitionAndBatches((bytes32,address,uint256,bytes)[])")) ||
                msg.sig == bytes4(keccak256("setDefaultPartitions(bytes32,address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("authorizeOperator(address,address[])")) ||
                msg.sig == bytes4(keccak256("revokeOperator(address,address[])"))
            )
            {
                erc = _erc1410;
                break;
            } else

            //ERC1594
            if(
                msg.sig == bytes4(keccak256("KYCtokenHolders(address[])")) ||
                msg.sig == bytes4(keccak256("unKYCtokenHolders(address[])")) ||
                msg.sig == bytes4(keccak256("issue(address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("redeemFrom(address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("setRulesContract(address)")) ||
                msg.sig == bytes4(keccak256("renounceIssuance()"))
            )
            {
                erc = _erc1594;
                break;
            } else

            //ERC20
            if(
                msg.sig == bytes4(keccak256("setNav(uint256)")) ||
                msg.sig == bytes4(keccak256("setLotSize(uint256)"))
              )
              {
                erc = _erc20;
                break;
            } else

            //ERC1644
            if(
                msg.sig == bytes4(keccak256("controllerTransferByPartition(bytes32,address,address,uint256,bytes,bytes)")) ||
                msg.sig == bytes4(keccak256("controllerTransfer(address,address,uint256,bytes,bytes)")) ||
                msg.sig == bytes4(keccak256("controllerRedeemByPartition(bytes32,address,uint256,bytes,bytes)")) ||
                msg.sig == bytes4(keccak256("controllerRedeem(address,uint256,bytes,bytes)"))
            )
            {
                erc = _erc1644;
                break;
            } else

            //ERC1643
            if(
                msg.sig == bytes4(keccak256("setDocument(bytes32,string,bytes32)")) ||
                msg.sig == bytes4(keccak256("removeDocument(bytes32)"))
            )
            {
                erc = _erc1643;
                break;
            } else

            //---------------- VIEW ----------------
            //ERC1410
            if(
                msg.sig == bytes4(keccak256("partitionsContract()")) ||
                msg.sig == bytes4(keccak256("isOperator(address,address)")) ||
                msg.sig == bytes4(keccak256("operators(address[])")) ||
                msg.sig == bytes4(keccak256("canIssueByPartition(bytes32,address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("getDefaultPartitions()")) ||
                msg.sig == bytes4(keccak256("getDefaultPartition()")) ||
                msg.sig == bytes4(keccak256("partitionsOf(address)")) ||
                msg.sig == bytes4(keccak256("totalPartitions()")) ||
                msg.sig == bytes4(keccak256("balanceOfByPartition(bytes32,address)")) ||
                msg.sig == bytes4(keccak256("totalSupplyByPartition(bytes32)")) ||
                msg.sig == bytes4(keccak256("canTransferByPartition(address,address,bytes32,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("canRedeemByPartition(address,bytes32,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("erc1410Contract()"))
            )
            {
                erc = _erc1410;
                break;
            } else

            //ERC1594
            if(
                msg.sig == bytes4(keccak256("rulesContract()")) ||
                msg.sig == bytes4(keccak256("certificateTokenContract()")) ||
                msg.sig == bytes4(keccak256("certificateControllerContract()")) ||
                msg.sig == bytes4(keccak256("isIssuable()")) ||
                msg.sig == bytes4(keccak256("canTransferFrom(address,address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("canRedeem(address,uint256,bytes)")) ||
                msg.sig == bytes4(keccak256("isTokenHolderKYC(address)")) ||
                msg.sig == bytes4(keccak256("erc1594Contract()"))
            )
            {
                erc = _erc1594;
                break;
            } else

            //ERC20
            if(
                msg.sig == bytes4(keccak256("name()")) ||
                msg.sig == bytes4(keccak256("symbol()")) ||
                msg.sig == bytes4(keccak256("decimals()")) ||
                msg.sig == bytes4(keccak256("totalSupply()")) ||
                msg.sig == bytes4(keccak256("balanceOf(address)")) ||
                msg.sig == bytes4(keccak256("erc20Contract()")) ||
                msg.sig == bytes4(keccak256("nav()")) ||
                msg.sig == bytes4(keccak256("navDecimals()")) ||
                msg.sig == bytes4(keccak256("lotSize()"))
            )
            {
                erc = _erc20;
                break;
            } else

            //ERC1644
            if(
                msg.sig == bytes4(keccak256("isControllable()")) ||
                msg.sig == bytes4(keccak256("erc1644Contract()")) ||
                msg.sig == bytes4(keccak256("certificateTokenNonce()"))
              )
            {
                erc = _erc1644;
                break;
            } else

            //ERC1643
            if(
                msg.sig == bytes4(keccak256("getDocument(bytes32)")) ||
                msg.sig == bytes4(keccak256("getAllDocuments()")) ||
                msg.sig == bytes4(keccak256("erc1643Contract()"))
            )
            {
                erc = _erc1643;
                break;
            } else {
              revert("invalid method call");
            }
        }

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, erc, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }
}
