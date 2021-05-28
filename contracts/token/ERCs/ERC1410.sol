pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import '../ERC1400.sol';
import '../../rules/IRules.sol';
import '../../partitions/IPartitions.sol';
import "../../mixins/Utils.sol";

/** @title ERC1410 standard */
contract ERC1410 is ERC1400 {

    using Utils for bytes32;
    using Utils for bytes;

    //------------------ MODIFIERS ---------------------

    /** @dev Check if msg.sender is operator */
    modifier onlyOperator() {
        require(_isOperator(), "invalid operator");
        _;
    }

    //------------------ EVENTS ---------------------

    /** @dev Event to log issuance by partition
      * @param partition .
      * @param operator .
      * @param to .
      * @param amount .
      * @param data to allow off-chain rules management
      * @param operatorData .
      */
    event IssuedByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed to,
        uint256 amount,
        bytes data,
        bytes operatorData
    );

    /** @dev Event to log redemption by partition
      * @param partition .
      * @param operator .
      * @param from .
      * @param amount .
      * @param operatorData .
      */
    event RedeemedByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed from,
        uint256 amount,
        bytes operatorData
    );

    /** @dev Event to log transfer by partition
      * @param fromPartition .
      * @param operator .
      * @param from .
      * @param to .
      * @param value .
      * @param data .
      * @param operatorData .
      */
    event TransferByPartition(
        bytes32 indexed fromPartition,
        address operator,
        address indexed from,
        address indexed to,
        uint256 value,
        bytes data,
        bytes operatorData
    );

    /** @dev Event to log when a new operator is authorized
      * @param operator .
      * @param tokenHolder address of investor who authorized the operator
      */
    event AuthorizedOperator(address indexed operator, address indexed tokenHolder);

    /** @dev Event to log when a operator is revoked
      * @param operator .
      * @param tokenHolder address of investor who revoked the operator
      */
    event RevokedOperator(address indexed operator, address indexed tokenHolder);


    //------------------ CONSTRUCTOR ---------------------

    /** @dev Constructor: Set default partitions, operators and Partitions contract address
      * @param defaultPartitions .
      * @param operators list of authorized operators
      */
    function initialize(
        bytes32[] memory defaultPartitions,
        address[] memory operators
    )
        public
    {
        setDefaultPartitions(defaultPartitions);

        for(uint256 i=0; i < operators.length; i++) {
          _validOperators[operators[i]] = true;
        }

        _operators = operators;
    }


    //------------------ EXTERNAL ---------------------

    /** [ ERC-1410 INTERFACE (4/9) ]
      * @dev Authorize an operator for a list of KYCed token holders
      * @param operator .
      * @param tokenHolders .
      */
    function authorizeOperator(
        address operator,
        address[] calldata tokenHolders
    )
        onlyIssuer
        external
    {
        require(operator != address(0), "invalid 0x00 address");
        require(_validOperators[operator] == false, "invalid same address");

        _validOperators[operator] = true;
        _operators.push(operator);

        for(uint256 i=0; i < tokenHolders.length; i++) {
            _issuerAuthorizeOperator(operator, tokenHolders[i]);
        }
    }

    /** [ ERC-1410 INTERFACE (5/9) ]
      * @dev Revoke an operator for a list of KYCed token holders
      * @param operator .
      * @param tokenHolders .
      */
    function revokeOperator(
        address operator,
        address[] calldata tokenHolders
    )
        onlyIssuer
        external
    {
        require(operator != address(0), "invalid 0x00 address");
        require(_validOperators[operator] == true, "invalid operator");

        _validOperators[operator] = false;
        _operators.push(operator);

        for(uint256 i=0; i < tokenHolders.length; i++) {
            _issuerRevokeOperator(operator, tokenHolders[i]);
        }
    }

    /** [ ERC-1410 INTERFACE (6/9) ]
      * @dev Check if an address is a valid operator of a specific token holder
      * @param operator .
      * @param tokenHolder .
      */
    function isOperator(address operator, address tokenHolder) external view returns (bool) {
        return _authorizedOperator[operator][tokenHolder];
    }

    /** [ ERC-1410 INTERFACE (7/9) ]
      * @dev Get the default partition of the Token
      * @param tokenHolder .
      * @return list of partitions for a specific token holder
      */
    function partitionsOf(address tokenHolder) external view returns(bytes32[] memory) {
        return _partitionsOf[tokenHolder];
    }

    /** [ ERC-1410 INTERFACE (8/9) ]
      * @dev Get total balance for a specific token holder and partition
      * @param partition .
      * @param tokenHolder .
      * @return balance of token holder by partition
      */
    function balanceOfByPartition(
        bytes32 partition,
        address tokenHolder
    )
        external
        view
        returns(uint256)
    {
        return _balanceOfByPartition[tokenHolder][partition];
    }

    /** @dev Get a list of all partitions of the token
      * @return _totalPartitions
      */
    function totalPartitions() external view returns(bytes32[] memory) {
        return _totalPartitions;
    }

    /** @dev Get total total supply for a specific partition
      * @param partition .
      * @return total supply for a specific partition
      */
    function totalSupplyByPartition(bytes32 partition) external view returns(uint256) {
        return _totalSupplyByPartition[partition];
    }

    /** @dev Get the address of the Partitions contract
      * @return _partitions
      */
    function partitionsContract() external view returns(address) {
        return _partitions;
    }

    /** @dev Get the default partitions of the Token
      * @return _tokenDefaultPartitions
      */
    function getDefaultPartitions()
        external
        view
        returns (bytes32[] memory)
    {
        return _tokenDefaultPartitions;
    }

    /** @dev Get list of authorized operators
      * @return _operators
      */
    function operators() external view returns (address[] memory) {
        return _operators;
    }

    /** @dev Returns address of the ERC1410 contract
      * @return _erc1410
      */
    function erc1410Contract() external view returns(address) {
        return _erc1410;
    }


    //------------------ PUBLIC ---------------------

    /** [ ERC-1410 INTERFACE (1/9) ]
      * @dev Issue value for a specific partition and token holder
      * @param partition of the Token
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      */
    function issueByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes memory data
    )
        onlyIssuer
        public
    {
        (byte code, bytes32 reason, /*bytes32 partition*/) = canIssueByPartition(
            partition,
            tokenHolder,
            value,
            data
        );

        require(code == hex"51", (reason).toString());
        _addTokenToPartition(tokenHolder, partition, value);

        emit IssuedByPartition(partition, msg.sender, tokenHolder, value, data, new bytes(32));
    }

    /** [ ERC-1410 INTERFACE (2/9) ]
      * @dev Operator transfers value from sender to receiver by partition
      * @param partition .
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @param operatorData to allow certification signing system
      * @return partition
      */
    function operatorTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes memory data,
        bytes memory operatorData
    )
        onlyOperator
        public
        returns(bytes32)
    {
      (byte code, bytes32 reason, /*bytes32 partition*/) = canTransferByPartition(
          from,
          to,
          partition,
          value,
          data
      );

      require(code == hex"51", (reason).toString());
      _transferFromByPartition(partition, from, to, value, data);

      emit TransferByPartition(partition, msg.sender, from, to, value, data, operatorData);

      return(partition);
    }

    /** [ ERC-1410 INTERFACE (3/9) ]
      * @dev Redeem value for a specific partition and token holder
      * @param partition of the Token
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      */
    function operatorRedeemByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes memory data
    )
        onlyIssuer
        public
    {
        (byte code, bytes32 reason, /*bytes32 partition*/) = canRedeemByPartition(
            tokenHolder,
            partition,
            value,
            data
        );

        require(code == hex"51", (reason).toString());
        _removeTokenFromPartition(tokenHolder, partition, value);

        emit RedeemedByPartition(partition, msg.sender, tokenHolder, value, data);
    }

    /** @dev Issue value for a specific partition and token holder by batches
      * @param issuances .
      */
    function issueByPartitionAndBatches(
        Issuance[] memory issuances
    )
        onlyIssuer
        public
    {
        for(uint256 i=0; i < issuances.length; i++) {
            issueByPartition(
                issuances[i].partition,
                issuances[i].tokenHolder,
                issuances[i].value,
                issuances[i].data
            );
        }
    }

    /** @dev Issue value for a specific partition and token holder by batches
      * @param transfers .
      */
    function operatorTransferByPartitionAndBatches(
        Transfer[] memory transfers
    )
        onlyOperator
        public
    {
        for(uint256 i=0; i < transfers.length; i++) {
            operatorTransferByPartition(
                transfers[i].partition,
                transfers[i].from,
                transfers[i].to,
                transfers[i].value,
                transfers[i].data,
                transfers[i].operatorData
            );
        }
    }

    /** @dev Redeem value for a specific partition and token holder by batches
      * @param redemptions .
      */
    function operatorRedeemByPartitionAndBatches(
        Redemption[] memory redemptions
    )
        onlyIssuer
        public
    {
        for(uint256 i=0; i < redemptions.length; i++) {
            operatorRedeemByPartition(
                redemptions[i].partition,
                redemptions[i].tokenHolder,
                redemptions[i].value,
                redemptions[i].data
            );
        }
    }

    /** @dev Set the default partitions for the Token
      * @param partitions list of partitions
      */
    function setDefaultPartitions(bytes32[] memory partitions)
        public
        onlyIssuer
    {
        _tokenDefaultPartitions = partitions;
    }

    /** [ ERC-1410 INTERFACE (9/9) ]
      * @dev Call Rules contract and checks if transfer is possible for given params
      * @param from .
      * @param to .
      * @param partition .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canTransferByPartition(
        address from,
        address to,
        bytes32 partition,
        uint256 value,
        bytes memory data
    )
        public
        view
        returns (byte, bytes32, bytes32)
    {
        //first 32bytes of data is a bool identifying if actor is controller or not
        //some rules are not applicable for controllers
        bytes memory controller = new bytes(32);

        if(isController(msg.sender)) {
            controller[31] = hex"01";
        }

        data = (controller).concat(data);
        return IRules(_rules).canTransferByPartition(
            from,
            to,
            partition,
            _partitions,
            value,
            data
        );
    }

    /** @dev Call Rules contract and checks if issuance is possible for given params
      * @param partition of the Token
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canIssueByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes memory data
    )
        public
        view
        returns(byte, bytes32, bytes32)
    {
        return IRules(_rules).canIssueByPartition(
            partition,
            _partitions,
            tokenHolder,
            value,
            data
        );
    }

    /** @dev Call Rules contract and checks if redeem is possible for given params
      * @param from .
      * @param partition .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canRedeemByPartition(
        address from,
        bytes32 partition,
        uint256 value,
        bytes memory data
    )
        public
        view
        returns (byte, bytes32, bytes32)
    {
        //first 32bytes of data is a bool identifying if actor is controller or not
        //some rules are not applicable for controllers
        bytes memory controller = new bytes(32);

        if(isController(msg.sender)) {
            controller[31] = hex"01";
        }

        data = (controller).concat(data);
        return IRules(_rules).canRedeemByPartition(
            from,
            partition,
            _partitions,
            value,
            data
        );
    }


    //------------------ INTERNAL ---------------------

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

    /** @dev Authorize address to be a valid operator of a KYCed token holder
      * @param operator .
      * @param tokenHolder .
      */
    function _issuerAuthorizeOperator(address operator, address tokenHolder) internal
    {
        require(_tokenHoldersKYC[tokenHolder] == true, "invalid token holder");
        _authorizedOperator[operator][tokenHolder] = true;
        emit AuthorizedOperator(operator, tokenHolder);
    }

    /** @dev Revoke address not being it a valid operator for a KYCed token holder
      * @param operator .
      * @param tokenHolder .
      */
    function _issuerRevokeOperator(address operator, address tokenHolder) internal
    {
        require(_tokenHoldersKYC[tokenHolder] == true, "invalid token holder");
        _authorizedOperator[operator][tokenHolder] = false;
        emit RevokedOperator(operator, tokenHolder);
    }

    /** @dev Check if msg.sender is an operator */
    function _isOperator() internal view returns(bool) {
        return(_validOperators[msg.sender]);
    }

    /** @dev Get the default partition of the Token
      * @return first position of _tokenDefaultPartitions
      */
    function _getDefaultPartition() internal view returns(bytes32) {
        return _tokenDefaultPartitions[0];
    }
}
