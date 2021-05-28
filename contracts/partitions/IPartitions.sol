pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

interface IPartitions {
  struct Variable {
    bytes32 key;
    string kind;
  }

  function token() external view returns(address);

  function isToken() external view returns(bool);

  function setToken(address tokenContract) external;

  function isPartition(bytes32 partition) external view returns(bool);

  function setPartition(bytes32 partition, bytes calldata data) external;

  function removePartition(bytes32 partition) external;

  function getVariable() external view returns(Variable[] memory);

  function setVariables(Variable calldata newVariable) external;

  function setValues(bytes32 partition, bytes32[] calldata keys, bytes32[] calldata values) external;

  function getValue(bytes32 partition, bytes32 key) external view returns(bytes32 value);

  function isKey(bytes32 key) external view returns(bool);
}
