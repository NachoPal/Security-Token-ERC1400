pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

interface IRules {
  function canTransferFrom(address from, address to, uint256 value, bytes calldata data) external view returns (byte, bytes32);
  function canRedeem(address from, uint256 value, bytes32[] calldata defaultPartitions, address partitions, bytes calldata data) external view returns (byte, bytes32);
  function canTransferByPartition(address from, address to, bytes32 partition, address partitions, uint256 value, bytes calldata data) external view returns (byte, bytes32, bytes32);
  function canRedeemByPartition(address from, bytes32 partition, address partitions, uint256 value, bytes calldata data) external view returns (byte, bytes32, bytes32);
  function canIssueByPartition(bytes32 partition, address partitions, address tokenHolder, uint256 value, bytes calldata data) external view returns(byte, bytes32, bytes32);
}
