pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import "../mixins/SafeMath.sol";
import '../partitions/IPartitions.sol';

interface IERC1400 {
    function isTokenHolderKYC(address tokenHolder) external view returns(bool);
    function isIssuable() external view returns(bool);
    function balanceOf(address tokenHolder) external view returns (uint256);
    function balanceOfByPartition(bytes32 partition, address tokenHolder) external view returns(uint256);
    function nav() external view returns(uint256);
    function navDecimals() external view returns(uint8);
    function decimals() external view returns(uint8);
    function lotSize() external view returns(uint256);
  }

/** @title Rules */
contract Rules {

    using SafeMath for uint256;

    //------------------ STATE VARIABLES ---------------------

    bytes32 private constant lockupExpirationRedemptionKey = 0x6c6f636b75705f65787069726174696f6e5f726564656d7074696f6e00000000;
    bytes32 private constant lockupExpirationTransferKey = 0x6c6f636b75705f65787069726174696f6e5f7472616e73666572000000000000;
    bytes32 private constant granularityKey = 0x6772616e756c6172697479000000000000000000000000000000000000000000;
    bytes32 private constant issuanceFloorKey = 0x69737375616e63655f666c6f6f72000000000000000000000000000000000000;


    //------------------ EXTERNAL ---------------------

    /** @dev Check if issuance is possible for given params
      * @param partition of the Token
      * @param tokenHolder .
      * @param value .
      * @return ERC1066 standar reason codes
      */
    function canIssueByPartition(
        bytes32 partition,
        address partitions,
        address tokenHolder,
        uint256 value,
        bytes calldata /*data*/
    )
        external
        view
        returns(byte, bytes32, bytes32)
    {
        if(!IPartitions(partitions).isPartition(partition)) {
            return(hex"69", "partition does not exist", partition);
        }

        if(IPartitions(partitions).isKey(issuanceFloorKey)) {
            uint256 nav = IERC1400(msg.sender).nav();
            uint8 decimalsNav = IERC1400(msg.sender).navDecimals();
            uint8 decimalsToken = IERC1400(msg.sender).decimals();
            bytes32 issuanceFloor = IPartitions(partitions).getValue(
                partition,
                issuanceFloorKey
            );
            bytes32 granularity = IPartitions(partitions).getValue(
                partition,
                granularityKey
            );
            uint256 fiatValue = value.mul(nav);
            fiatValue = fiatValue.div(uint256(10)**(decimalsNav+decimalsToken));

            if(fiatValue < uint256(issuanceFloor)) {
                return(hex"76", "invalid issuance (amount)", partition);
            } else if(fiatValue.mod(uint256(granularity)) != 0) {
                return(hex"77", "invalid issuance (granularity)", partition);
            }
        }

        if(!IERC1400(msg.sender).isTokenHolderKYC(tokenHolder)) {
            return(hex"57", "invalid receiver", partition);
        }

        if(!IERC1400(msg.sender).isIssuable()) {
            return(hex"67", "token not issuable", partition);
        }

        return(hex"51", "transfer success", partition);
    }

    /** @dev Check if transfer is possible for given params.
      * @param from .
      * @param to .
      * @param value .
      * @return ERC1066 standar reason codes
      */
    function canTransferFrom(
        address from,
        address to,
        uint256 value,
        bytes calldata /*data*/
    )
        external
        view
        returns (byte, bytes32)
    {

        if(!IERC1400(msg.sender).isTokenHolderKYC(from)) {
            return(hex"56", "invalid sender");
        }

        if(!IERC1400(msg.sender).isTokenHolderKYC(to)) {
            return(hex"57", "invalid receiver");
        }

        if(IERC1400(msg.sender).balanceOf(from) < value) {
            return(hex"52", "insufficient balance");
        }

        if(value <= 0) {
            return(hex"61", "invalid value");
        }

        return(hex"51", "transfer success");
    }

    /** @dev Check if redemption is possible for given params.
      * Iteretates over default partitions to check if redemption is possible for all of them
      * @param from .
      * @param value .
      * defaultPartitions partitions to iterate over
      * @param data to allow off-chain rules management
      * @return ERC1066 standar reason codes
      */
    function canRedeem(
        address from,
        uint256 value,
        bytes32[] calldata defaultPartitions,
        address partitions,
        bytes calldata data
    )
        external
        view
        returns(byte, bytes32)
    {
        if(!IERC1400(msg.sender).isTokenHolderKYC(from)) {
            return(hex"56", "invalid sender");
        }

        if(IERC1400(msg.sender).balanceOf(from) < value) {
            return(hex"52", "insufficient balance");
        }

        uint remainingValue = value;
        uint valueByPartition;

        for(uint i; i < defaultPartitions.length; i++) {
            valueByPartition = IERC1400(msg.sender).balanceOfByPartition(
                defaultPartitions[i],
                from
            );

            if(valueByPartition >= remainingValue) {
                (byte code, bytes32 reason, /*bytes32 partition*/) = canRedeemByPartition(
                    from,
                    defaultPartitions[i],
                    partitions,
                    remainingValue,
                    data
                );

                if(code != hex"51") {
                    return(code, reason);
                }
                break;
            } else {
              remainingValue = remainingValue.sub(valueByPartition);

              (byte code, bytes32 reason, /*bytes32 partition*/) = canRedeemByPartition(
                  from,
                  defaultPartitions[i],
                  partitions,
                  valueByPartition,
                  data
              );

              if(code != hex"51") {
                  return(code, reason);
              }
            }
        }

        return(hex"51", "transfer success");
    }

    /** @dev Call Rules contract and checks if transfer is possible for given params
      * @param from .
      * @param to .
      * @param partition .
      * @param partitions address of the Partitions contract
      * @param value .
      * @return ERC1066 standar reason codes
      */
    function canTransferByPartition(
        address from,
        address to,
        bytes32 partition,
        address partitions,
        uint256 value,
        bytes calldata data
    )
        external
        view
        returns (byte, bytes32, bytes32)
    {
        if(!IPartitions(partitions).isPartition(partition)) {
            return(hex"69", "partition does not exist", partition);
        }

        (bool isController, /*bytes memory rulesData*/) = abi.decode(data, (bool, bytes));

        if(!isController) {
            if(IPartitions(partitions).isKey(lockupExpirationTransferKey)) {
                bytes32 lockupExpirationTime = IPartitions(partitions).getValue(
                  partition,
                  lockupExpirationTransferKey
                );
                if(now < uint256(lockupExpirationTime)) {
                    return(hex"55", "funds locked (lockup period)", partition);
                }
            }

            uint256 lotSize = IERC1400(msg.sender).lotSize();

            if(value.mod(lotSize) != 0) {
                return(hex"78", "invalid transfer lot size", partition);
            }
        }

        if(!IERC1400(msg.sender).isTokenHolderKYC(from)) {
            return(hex"56", "invalid sender", partition);
        }

        if(!IERC1400(msg.sender).isTokenHolderKYC(to)) {
            return(hex"57", "invalid receiver", partition);
        }

        if(IERC1400(msg.sender).balanceOfByPartition(partition, from) < value) {
            return(hex"52", "insufficient balance", partition);
        }

        if(value <= 0) {
            return(hex"61", "invalid value", partition);
        }

        return(hex"51", "transfer success", partition);
    }


    //------------------ PUBLIC ---------------------

    /** @dev Checks if transfer is possible for given params
      * @param from .
      * @param partition .
      * @param partitions address of the Partitions contract
      * @param value .
      * @return ERC1066 standar reason codes
      */
    function canRedeemByPartition(
        address from,
        bytes32 partition,
        address partitions,
        uint256 value,
        bytes memory data
    )
        public
        view
        returns (byte, bytes32, bytes32)
    {
      if(!IPartitions(partitions).isPartition(partition)) {
          return(hex"69", "partition does not exist", partition);
      }

      (bool isController, /* bytes memory rulesData */) = abi.decode(data, (bool, bytes));

      if(!isController) {
          if(IPartitions(partitions).isKey(lockupExpirationRedemptionKey)) {
              bytes32 lockupExpirationTime = IPartitions(partitions).getValue(
                  partition,
                  lockupExpirationRedemptionKey
              );
              if(now < uint256(lockupExpirationTime)) {
                  return(hex"55", "funds locked (lockup period)", partition);
              }
          }
      }

      if(!IERC1400(msg.sender).isTokenHolderKYC(from)) {
          return(hex"56", "invalid sender", partition);
      }

      if(IERC1400(msg.sender).balanceOfByPartition(partition, from) < value) {
          return(hex"52", "insufficient balance", partition);
      }

      if(value <= 0) {
          return(hex"61", "invalid value", partition);
      }

      return(hex"51", "transfer success", partition);
    }
}
