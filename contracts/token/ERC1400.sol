pragma solidity 0.5.2;

import '../mixins/Controllable.sol';
import "../mixins/SafeMath.sol";

contract ERC1400 is Controllable {

    using SafeMath for uint256;

    //===========================================================================
    //============================ STATE VARIABLES ==============================
    //===========================================================================

    //---------------------------- ERC20 --------------------------------------
    struct ERC20details {
        string name;
        string symbol;
        uint8 decimals;
        uint256 nav;
        uint8 navDecimals;
        uint256 lotSize;
    }

    string public _name;
    string internal _symbol;
    uint8 internal _decimals;
    mapping (address => mapping (address => uint256)) private _allowed;

    uint256 internal _nav;

    uint8 internal _navDecimals;

    uint256 internal _lotSize;

    address internal _erc20;

    //---------------------------- ERC1643 --------------------------------------
    struct Document {
        bytes32 name;
        string uri;
        bytes32 documentHash;
        uint timeStamp;
        uint index;
    }

    mapping(bytes32 => Document) internal _documents;
    bytes32[] internal _documentsNames;

    address internal _erc1643;

    //---------------------------- ERC1594 --------------------------------------
    bool internal _isIssuable = true;

    mapping (address => bool) internal _tokenHoldersKYC;

    address internal _rules;

    address internal _certificateToken;

    address internal _erc1594;

    //---------------------------- ERC1410 --------------------------------------
    struct Issuance {
        bytes32 partition;
        address tokenHolder;
        uint256 value;
        bytes data;
    }

    struct Transfer {
        bytes32 partition;
        address from;
        address to;
        uint256 value;
        bytes data;
        bytes operatorData;
    }

    struct Redemption {
        bytes32 partition;
        address tokenHolder;
        uint256 value;
        bytes data;
    }

    bytes32[] internal _totalPartitions;
    bytes32[] internal _tokenDefaultPartitions;
    mapping (address => bytes32[]) internal _partitionsOf;

    mapping (bytes32 => uint256) internal _totalSupplyByPartition;
    mapping (address => mapping (bytes32 => uint256)) internal _balanceOfByPartition;

    mapping(address => mapping(address => bool)) internal _authorizedOperator;
    address[] internal _operators;
    mapping(address => bool) internal _validOperators;

    address internal _partitions;

    address internal _erc1410;

    //---------------------------- ERC1644 --------------------------------------
    bool internal _isControllable;

    bytes32 constant internal NONCES_MAPPING_POSITION_TOKEN = keccak256("certificate.token.mapping.nonce");

    address internal _erc1644;
}
