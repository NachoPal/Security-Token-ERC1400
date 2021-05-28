pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import "../mixins/Ownable.sol";

/** @title Partitions */
contract Partitions is Ownable {

    //------------------ MODIFIERS ---------------------

    /** @dev Check if msg.sender is Token*/
    modifier onlyToken() {
        require(isToken(), "invalid associated token");
        _;
    }


    //------------------ EVENTS ---------------------

    /** @dev Event emitted when Token is associated to Partitions contract
      * @param token address od the Token contract
      */
    event TokenSet(address indexed token);

    /** @dev Event emitted when when a new partition is created
      * @param partition .
      */
    event PartitionSet(bytes32 indexed partition);

    /** @dev Event emitted when when a partition is removed
      * @param partition .
      */
    event PartitionRemoved(bytes32 indexed partition);

    /** @dev Event emitted when a new type of variable is associated to partitions
      * @param key name of the variable
      * @param kind type of the key (uint256, address, ...)
      */
    event VariableSet(bytes32 key, string kind);

    /** @dev Event emitted when a value is set for a certain variable
      * @param partition .
      * @param key name of the variable
      * @param value .
      */
    event ValueSet(bytes32 indexed partition, bytes32 indexed key, bytes32 value);

    /** @dev Event emitted when a value is removed from a certain variable
      * @param partition .
      * @param key name of the variable
      */
    event ValueRemoved(bytes32 indexed partition, bytes32 indexed key);


    //------------------ STATE VARIABLES ---------------------

    address internal _issuer;
    address internal _token;
    bool _tokenSet;

    struct Variable {
        bytes32 key;
        string kind;
    }

    Variable[] internal _variables;
    mapping(bytes32 => bool) internal _validVariables;

    struct Partition {
        bytes32 name;
        bytes data;
    }

    mapping(bytes32 => bool) internal _validPartitions;


    //------------------ CONSTRUCTOR ---------------------

    /** @dev Constructor: Set inital partitions and they variables
      * @param variables Keys and type variables accepted by all partitions
      * @param partitions Name and variables values
      */
    constructor(Variable[] memory variables, Partition[] memory partitions) public {
        for(uint256 i; i < variables.length; i++) {
          _variables.push(variables[i]);
          _validVariables[variables[i].key] = true;
        }

        for(uint256 j; j < partitions.length; j++) {
          setPartition(partitions[j].name, partitions[j].data);
        }
    }


    //------------------ EXTERNAL ---------------------

    /** @dev Associate a Token to this Partitions contract
      * @param tokenContract .
      */
    function setToken(address tokenContract) onlyIssuer external {
        require(_tokenSet == false, "partition can not change token owner");
        _tokenSet = true;
        _token = tokenContract;

        emit TokenSet(_token);
    }

    /** @dev Remove a partition
      * @param partition .
      */
    function removePartition(bytes32 partition) onlyToken external {
        _removeValues(partition);
        _validPartitions[partition] = false;

        emit PartitionRemoved(partition);
    }

    /** @dev Get the value for a key of a certain partition
      * @param partition .
      * @param key .
      */
    function getValue(
        bytes32 partition,
        bytes32 key
    )
        external
        view
        returns(bytes32 value)
    {
        bytes32 position = keccak256(abi.encodePacked(partition, key));
        assembly { value := sload(position) }
    }

    /** @dev Return the address of the associated Token
      * @return _token
    */
    function token() external view returns(address) {
        return _token;
    }

    /** @dev Get a list of all the valid variables for the partitions
      * @return _variables
      */
    function getVariables() external view returns(Variable[] memory) {
        return _variables;
    }


    //------------------ PUBLIC ---------------------

    /** @dev Set a new valid variable associated to the partitions
      * @param variables array of tuple key-kind
      */
    function setVariables(Variable[] memory variables) onlyIssuer public {
        for(uint256 i=0; i < variables.length; i++) {
          require(!isKey(variables[i].key), "partition key already exists");
          _validVariables[variables[i].key] = true;
          _variables.push(variables[i]);

          emit VariableSet(variables[i].key, variables[i].kind);
        }
    }

    /** @dev Set a new partition
      * @param partition .
      * @param data abi encode bytes containing an array of tuple key-value
      */
    function setPartition(bytes32 partition, bytes memory data) onlyIssuer public {
        require(!isPartition(partition), "partition already exists");
        _validPartitions[partition] = true;
        setValues(partition, data);

        emit PartitionSet(partition);
    }

    /** @dev Set values for a certain partition
      * @param partition .
      * @param data abi encode bytes containing an array of tuple key-value
      */
    function setValues(bytes32 partition, bytes memory data) onlyIssuer public {
        require(isPartition(partition), "partition does not exist");

        (bytes32[] memory keys, bytes32[] memory values) = abi.decode(
            data,
            (bytes32[], bytes32[])
        );

        for(uint256 i=0; i < keys.length; i++) {
            require(isKey(keys[i]), "invalid partition key");
            bytes32 position = keccak256(abi.encodePacked(partition, keys[i]));
            bytes32 value = values[i];
            assembly { sstore(position, value) }

            emit ValueSet(partition, keys[i], values[i]);
        }
    }

    /** @dev Check if a key is set as part of a valid variable
      * @param key variable key
      */
    function isKey(bytes32 key) public view returns(bool) {
        return _validVariables[key];
    }

    /** @dev Check if a partition has been set in Partitions contract
      * @param partition .
      */
    function isPartition(bytes32 partition) public view returns(bool) {
        return _validPartitions[partition];
    }

    /** @dev Check is msg.sender is Token */
    function isToken() public view returns(bool) {
        return address(msg.sender) == _token;
    }


    //------------------ INTERNAL ---------------------

    /** @dev Remove values for a certain partition
      * @param partition .
      */
    function _removeValues(bytes32 partition) internal {
        for(uint256 i=0; i < _variables.length; i++) {
            bytes32 position = keccak256(abi.encodePacked(partition, _variables[i].key));
            assembly { sstore(position, 0) }

            emit ValueRemoved(partition, _variables[i].key);
        }
    }
}
