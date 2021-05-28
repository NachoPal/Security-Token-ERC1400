pragma solidity 0.5.2;

import '../ERC1400.sol';
import '../../partitions/IPartitions.sol';
import "../../mixins/Utils.sol";

/** @title ERC1644 standard */
contract ERC1644 is ERC1400 {

    using Utils for bytes32;

    //------------------ EVENTS ---------------------

    /** @dev Event to log when a controller force a transfer
      * @param controller .
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate data
      */
    event ControllerTransfer(
        address controller,
        address indexed from,
        address indexed to,
        uint256 value,
        bytes data,
        bytes controllerData
    );

    /** @dev Event to log when a controller force a redemption
      * @param controller .
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate data
      */
    event ControllerRedemption(
        address controller,
        address indexed tokenHolder,
        uint256 value,
        bytes data,
        bytes controllerData
    );

    /** @dev Event to log when a controller force a transfer by partition
      * @param controller .
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate data
      */
    event ControllerTransferByPartition(
        bytes32 partition,
        address controller,
        address indexed from,
        address indexed to,
        uint256 value,
        bytes data,
        bytes controllerData
    );

    /** @dev Event to log when a controller force a redemption by partition
      * @param controller .
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate data
      */
    event ControllerRedemptionByPartition(
        bytes32 partition,
        address controller,
        address indexed tokenHolder,
        uint256 value,
        bytes data,
        bytes controllerData
    );

    //------------------ EXTERNAL ---------------------

    /** [ ERC-1594 INTERFACE (1/3) ]
      * @dev Controller FORCE transfer from default partitions for two token holders
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate
      */
    function controllerTransfer(
        address from,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata controllerData
    )
        onlyController
        external
    {
        bytes32 response = _registerCertificateToken(
            controllerData,
            bytes32(0),
            from,
            to,
            value
        );

        require(response == bytes32(0), (response).toString());

        (byte code, bytes32 reason) = _canTransferFrom(from, to, value, data);

        require(code == hex"51", (reason).toString());

        uint256 remainingValue = value;
        uint256 valueByPartition;

        for(uint256 i; i < _tokenDefaultPartitions.length; i++) {
          valueByPartition = _balanceOfByPartition[from][_tokenDefaultPartitions[i]];

            if(valueByPartition >= remainingValue) {
                _transferFromByPartition(_tokenDefaultPartitions[i], from, to, remainingValue, data);
                break;
            } else {
                remainingValue = remainingValue.sub(valueByPartition);
                _transferFromByPartition(_tokenDefaultPartitions[i], from, to, valueByPartition, data);
            }
        }

        emit ControllerTransfer(msg.sender, from, to, value, data, controllerData);
    }

    /** [ ERC-1594 INTERFACE (2/3) ]
      * @dev Controller FORCE redeem for default partitions for a token holder
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate
      */
    function controllerRedeem(
        address tokenHolder,
        uint256 value,
        bytes calldata data,
        bytes calldata controllerData
    )
        onlyController
        external
    {
      bytes32 response = _registerCertificateToken(
          controllerData,
          bytes32(0),
          tokenHolder,
          address(0),
          value
      );

        require(response == bytes32(0), (response).toString());

        uint256 remainingValue = value;
        uint256 valueByPartition;

        (byte code, bytes32 reason) = _canRedeem(tokenHolder, value, data);

        require(code == hex"51", (reason).toString());

        for(uint256 i; i < _tokenDefaultPartitions.length; i++) {
            valueByPartition = _balanceOfByPartition[tokenHolder][_tokenDefaultPartitions[i]];

            if(valueByPartition >= remainingValue) {
                _removeTokenFromPartition(tokenHolder, _tokenDefaultPartitions[i], remainingValue);
                break;
            } else {
                remainingValue = remainingValue.sub(valueByPartition);
                _removeTokenFromPartition(tokenHolder, _tokenDefaultPartitions[i], valueByPartition);
            }
        }

        emit ControllerRedemption(msg.sender, tokenHolder, value, data, controllerData);
    }

    /** @dev Controller FORCE transfer by partition for two token holders
      * @param partition .
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate
      */
    function controllerTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata controllerData
    )
        onlyController
        external
        returns(bytes32)
    {
        bytes32 response = _registerCertificateToken(
            controllerData,
            partition,
            from,
            to,
            value
        );

        require(response == bytes32(0), (response).toString());

        (byte code, bytes32 reason, /*bytes32 partition*/) = _canTransferByPartition(
            from,
            to,
            partition,
            value,
            data
        );

        require(code == hex"51", (reason).toString());
        _transferFromByPartition(partition, from, to, value, data);

        emit ControllerTransferByPartition(
            partition,
            msg.sender,
            from,
            to,
            value,
            data,
            controllerData
        );

        return(partition);
    }

    /** @dev Controller FORCE redeem by partition for a token holder
      * @param partition .
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @param controllerData signed certificate
      */
    function controllerRedeemByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes calldata data,
        bytes calldata controllerData
    )
        onlyController
        external
        returns(bytes32)
    {
        bytes32 response = _registerCertificateToken(
            controllerData,
            partition,
            tokenHolder,
            address(0),
            value
        );

        require(response == bytes32(0), (response).toString());

        (byte code, bytes32 reason, /*bytes32 partition*/) = _canRedeemByPartition(
            tokenHolder,
            partition,
            value,
            data
        );

        require(code == hex"51", (reason).toString());
        _removeTokenFromPartition(tokenHolder, partition, value);

        emit ControllerRedemptionByPartition(
            partition,
            msg.sender,
            tokenHolder,
            value,
            data,
            controllerData
        );

        return(partition);
    }

    /** [ ERC-1594 INTERFACE (3/3) ]
      * @dev Checks if the token accepts controllers and their methods. Should always return true
      * @return true (always)
      */
    function isControllable() external pure returns (bool) {
        return true;
    }

    /** @dev Returns address of the ERC1643 contract
      * @return _erc1644
      */
    function erc1644Contract() external view returns(address) {
        return _erc1644;
    }

    /** @dev Get next valid certificate nonce */
    function certificateTokenNonce() external view returns(uint256 nonce) {
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_TOKEN));
        assembly {
            nonce := sload(position)
        }
    }


    //------------------ INTERNAL ---------------------

    /** @dev Register a certificate
      * @param controllerData signed certificate
      * @param partition .
      * @param from .
      * @param to .
      * @param value .
      * @return bytes32 explaining if the certificate is valid or not anf why (reason)
      */
    function _registerCertificateToken(
        bytes memory controllerData,
        bytes32 partition,
        address from,
        address to,
        uint256 value
    )
        internal
        returns(bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_certificateToken).delegatecall(
            abi.encodeWithSignature(
                "register(bytes,bytes32,address,address,uint256,address[])",
                controllerData,
                partition,
                from,
                to,
                value,
                _controllersList
            )
        );

        return abi.decode(returnData, (bytes32));
    }

    /** @dev Handles adding/removing tokens to partitions
      * @param partition .
      * @param from .
      * @param to .
      * @param value .
      */
    function _transferFromByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes memory /*data*/
    )
        internal
    {
        _addTokenToPartition(to, partition, value);
        _removeTokenFromPartition(from, partition, value);
    }

    /** @dev Remove token balances from state variables and remove partition data
      * stored in Partitions contract if total supply by partition is reduced to 0
      * @param from .
      * @param partition .
      * @param value .
      */
    function _removeTokenFromPartition(address from, bytes32 partition, uint256 value) internal {
        _balanceOfByPartition[from][partition] = _balanceOfByPartition[from][partition].sub(value);
        _totalSupplyByPartition[partition] = _totalSupplyByPartition[partition].sub(value);

        if(_balanceOfByPartition[from][partition] == 0) {
            for (uint256 i = 0; i < _partitionsOf[from].length; i++) {
                if(_partitionsOf[from][i] == partition) {
                    _partitionsOf[from][i] = _partitionsOf[from][_partitionsOf[from].length - 1];
                    _partitionsOf[from].length--;
                    break;
                }
            }
        }

        if(_totalSupplyByPartition[partition] == 0) {
            for (uint256 i = 0; i < _totalPartitions.length; i++) {
                if(_totalPartitions[i] == partition) {
                    _totalPartitions[i] = _totalPartitions[_totalPartitions.length - 1];
                    _totalPartitions.length--;
                    IPartitions(_partitions).removePartition(partition);
                    break;
                }
            }
        }
    }

    /** @dev Add token balances to state variables
      * @param to .
      * @param partition .
      * @param value .
      */
    function _addTokenToPartition(address to, bytes32 partition, uint256 value) internal {
        if(_balanceOfByPartition[to][partition] == 0) {
            _partitionsOf[to].push(partition);
        }
        _balanceOfByPartition[to][partition] = _balanceOfByPartition[to][partition].add(value);

        if(_totalSupplyByPartition[partition] == 0) {
            _totalPartitions.push(partition);
        }
        _totalSupplyByPartition[partition] = _totalSupplyByPartition[partition].add(value);
    }

    /** @dev Call Rules contract and checks if transfer is possible for given params.
      * Iteretates over default partitions to check if transfer is possible for all of them
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function _canTransferFrom(
        address from,
        address to,
        uint256 value,
        bytes memory data
    )
        internal
        returns(byte, bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_erc1594).delegatecall(
            abi.encodeWithSignature(
              "canTransferFrom(address,address,uint256,bytes)",
              from, to, value, data
            )
        );

        (byte code, bytes32 reason) = abi.decode(returnData, (byte, bytes32));

        return(code, reason);
    }

    /** @dev Call Rules contract and checks if transfer is possible for given params
      * @param from .
      * @param to .
      * @param partition .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function _canTransferByPartition(
        address from,
        address to,
        bytes32 partition,
        uint256 value,
        bytes memory data
    )
        internal
        returns (byte, bytes32, bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_erc1410).delegatecall(
            abi.encodeWithSignature(
              "canTransferByPartition(address,address,bytes32,uint256,bytes)",
              from, to, partition, value, data
            )
        );

        (byte code, bytes32 reason, /*bytes32 partition*/) = abi.decode(
            returnData,
            (byte, bytes32, bytes32)
        );

        return(code, reason, partition);
    }

    /** @dev Call Rules contract and checks if redeem is possible for given params
      * @param from .
      * @param partition .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function _canRedeemByPartition(
        address from,
        bytes32 partition,
        uint256 value,
        bytes memory data
    )
        internal
        returns (byte, bytes32, bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_erc1410).delegatecall(
            abi.encodeWithSignature(
              "canRedeemByPartition(address,bytes32,uint256,bytes)",
              from, partition, value, data
            )
        );

        (byte code, bytes32 reason, /*bytes32 partition*/) = abi.decode(
            returnData,
            (byte, bytes32, bytes32)
        );

        return(code, reason, partition);
    }

    /** @dev Call Rules contract and checks if redemption is possible for given params.
      * Iteretates over default partitions to check if redemption is possible for all of them
      * @param from .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function _canRedeem(
        address from,
        uint256 value,
        bytes memory data
    )
        internal
        returns(byte, bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_erc1594).delegatecall(
            abi.encodeWithSignature(
              "canRedeem(address,uint256,bytes)",
              from, value, data
            )
        );

        (byte code, bytes32 reason) = abi.decode(returnData, (byte, bytes32));

        return(code, reason);
    }
}
