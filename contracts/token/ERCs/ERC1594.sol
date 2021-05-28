pragma solidity 0.5.2;

import '../ERC1400.sol';
import '../../rules/IRules.sol';
import '../../partitions/IPartitions.sol';
import "../../mixins/Utils.sol";

/** @title ERC1594 standard */
contract ERC1594 is ERC1400 {

    using Utils for bytes32;
    using Utils for bytes;

    //------------------ EVENTS ---------------------

    /** @dev Event to log Issuance
      * @param operator .
      * @param to address of buyer
      * @param value .
      * @param data to allow off-chain rules management
      */
    event Issued(address indexed operator, address indexed to, uint256 value, bytes data);

    /** @dev Event to log Redemption
      * @param operator .
      * @param from address of seller
      * @param value .
      * @param data to allow off-chain rules management
      */
    event Redeemed(address indexed operator, address indexed from, uint256 value, bytes data);

    /** @dev Event to log when issuer renounce to issue forever
      * @param issuer .
      */
    event IssuanceRenunciation(address indexed issuer);

    /** @dev Event to log when a new Rules contract is set
      * @param newContract .
      * @param oldContract .
      */
    event RulesContractSet(address indexed newContract, address indexed oldContract);

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

    /** @dev Constructor: Det address of contracts Rules and Certificate
      * @param rules Rules contract address
      * @param certificate Certificate contract address
      */
    /* function initialize(address rules, address certificate) public {
        _rules = rules;
        _certificate = certificate;
    } */


    //------------------ EXTERNAL ---------------------

    /** [ ERC-1594 INTERFACE (1/4) ]
      * @dev Issue token to token holder taking first position of default partitions
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      */
    function issue(
        address tokenHolder, uint256 value, bytes calldata data
    )
        onlyIssuer
        external
    {
        bytes32 defaultPartition = _tokenDefaultPartitions[0];

        (byte code, bytes32 reason, bytes32 partition) = _canIssueByPartition(
            defaultPartition, tokenHolder, value, data
        );

        require(code == hex"51", (reason).toString());
        _addTokenToPartition(tokenHolder, partition, value);

        emit Issued(msg.sender, tokenHolder, value, data);
    }

    /** [ ERC-1594 INTERFACE (2/4) ]
      * @dev Redeem token from token holder iterating over default partitions
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      */
    function redeemFrom(
        address tokenHolder,
        uint256 value,
        bytes calldata data
    )
        onlyIssuer
        external
    {
        uint256 remainingValue = value;
        uint256 valueByPartition;

        (byte code, bytes32 reason) = canRedeem(tokenHolder, value, data);
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

        emit Redeemed(msg.sender, tokenHolder, value, data);
    }

    /** @dev Whitelist a list of token holders and authorize existing operators for them.
      * @param tokenHolders .
      */
    function KYCtokenHolders(address[] calldata tokenHolders)
        onlyIssuer
        external
    {
        for(uint256 i=0; i < tokenHolders.length; i++) {
            _tokenHoldersKYC[tokenHolders[i]] = true;
            for(uint256 j=0; j < _operators.length; j++) {
                _issuerAuthorizeOperator(_operators[j], tokenHolders[i]);
            }
        }
    }

    /** @dev Unwhitelist a list of token holders and revoke existing operators for them.
      * @param tokenHolders .
      */
    function unKYCtokenHolders(address[] calldata tokenHolders)
        onlyIssuer
        external
    {
        for(uint256 i=0; i < tokenHolders.length; i++) {
            for(uint256 j=0; j < _operators.length; j++) {
                _issuerRevokeOperator(_operators[j], tokenHolders[i]);
            }
            _tokenHoldersKYC[tokenHolders[i]] = false;
        }
    }

    /** @dev Renounce to issuance forever. No way to roll back state after calling it. */
    function renounceIssuance() external onlyIssuer {
        _isIssuable = false;
        emit IssuanceRenunciation(_issuer);
    }

    /** @dev Set new address to appoint for Rules contract
      * @param newRules .
      */
    function setRulesContract(address newRules) onlyIssuer external {
        require(newRules != _rules, "invalid same address");
        require(newRules != address(0), "invalid 0x00 address");
        emit RulesContractSet(newRules, _rules);
        _rules = newRules;
    }

    /** [ ERC-1594 INTERFACE (3/4) ]
      * @dev Call Rules contract and checks if transfer is possible for given params.
      * Iteretates over default partitions to check if transfer is possible for all of them
      * @param from .
      * @param to .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canTransferFrom(
        address from,
        address to,
        uint256 value,
        bytes calldata data
    )
        external
        view
        returns(byte, bytes32)
    {
        bytes memory controller = new bytes(32);

        if(isController(msg.sender)) {
            controller[31] = hex"01";
        }

        bytes memory dataConcat = (controller).concat(data);
        return IRules(_rules).canTransferFrom(from, to, value, dataConcat);
    }

    /** @dev Returns address of the ERC1594 contract
      * @return _erc1594
      */
    function erc1594Contract() external view returns(address) {
        return _erc1594;
    }

    /** @dev Get the address of the rules contract
      * @return _rules
      */
    function rulesContract() external view returns(address) {
        return _rules;
    }

    /** @dev Returns address of the certificate token contract
      * @return _certificateToken
      */
    function certificateTokenContract() external view returns(address) {
        return _certificateToken;
    }

    /** @dev Returns address of the certificate controller contract
      * @return _certificateController
      */
    function certificateControllerContract() external view returns(address) {
        return _certificateController;
    }

    /** [ ERC-1594 INTERFACE (4/4) ]
      * @dev Returns if the token is issuable or not
      * @return _isIssuable
      */
    function isIssuable() external view returns(bool) {
        return _isIssuable;
    }

    /** @dev Check if a token holder is kYCed
      * @param tokenHolder .
      */
    function isTokenHolderKYC(address tokenHolder) external view returns(bool) {
        return _tokenHoldersKYC[tokenHolder];
    }


    //------------------ PUBLIC ---------------------

    /** @dev Call Rules contract and checks if redemption is possible for given params.
      * Iteretates over default partitions to check if redemption is possible for all of them
      * @param from .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canRedeem(
        address from,
        uint256 value,
        bytes memory data
    )
        public
        view
        returns(byte, bytes32)
    {
        bytes memory controller = new bytes(32);

        if(isController(msg.sender)) {
            controller[31] = hex"01";
        }

        data = (controller).concat(data);
        return IRules(_rules).canRedeem(
            from,
            value,
            _tokenDefaultPartitions,
            _partitions,
            data
        );
    }


    //------------------ INTERNAL ---------------------

    /** @dev Call Rules contract and checks if issuance is possible for given params
      * @param partition of the Token
      * @param tokenHolder .
      * @param value .
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function _canIssueByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes memory data
    )
        internal
        returns (byte, bytes32, bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_erc1410).delegatecall(
            abi.encodeWithSignature(
              "canIssueByPartition(bytes32,address,uint256,bytes)",
              partition, tokenHolder,value, data
            )
        );

        (byte code, bytes32 reason, /*bytes32 partition*/) = abi.decode(returnData, (byte, bytes32, bytes32));

        return(code, reason, partition);
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
}
