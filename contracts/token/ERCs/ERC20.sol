pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import '../ERC1400.sol';

/** @title ERC20 standard */
contract ERC20 is ERC1400 {

    //------------------ EVENTS ---------------------

    /** @dev Event to log a new NAV is set
      * @param nav .
      */
    event NavSet(uint256 nav);

    /** @dev Event to log a new lot size is set
      * @param lotSize .
      */
    event LotSizeSet(uint256 lotSize);


    //------------------ CONSTRUCTOR ---------------------

    /** @dev Constructor: Set toke details
      * @param tokenDetails .
      */
    function initialize(ERC20details memory tokenDetails) public {
        _name = tokenDetails.name;
        _symbol = tokenDetails.symbol;
        _decimals = uint8(tokenDetails.decimals);
        _nav = tokenDetails.nav;
        _navDecimals = tokenDetails.navDecimals;
        _lotSize = tokenDetails.lotSize;
    }


    //------------------ EXTERNAL ---------------------

    /** @dev Set a new NAV
      * @param navValue .
      */
    function setNav(uint256 navValue) onlyIssuer external {
        _nav = navValue;
        emit NavSet(navValue);
    }

    /** @dev Set a new NAV
      * @param lotSize .
      */
    function setLotSize(uint256 lotSize) onlyIssuer external {
        _lotSize = lotSize;
        emit LotSizeSet(lotSize);
    }

    /** [ ERC-20 INTERFACE (1/5) ]
      * @dev Get the name of the Token
      * @return _name
      */
    function name() external view returns(string memory) {
        return _name;
    }

    /** [ ERC-20 INTERFACE (2/5) ]
      * @dev Get the symbol of the Token
      * @return _symbol
      */
    function symbol() external view returns(string memory) {
        return _symbol;
    }

    /** [ ERC-20 INTERFACE (3/5) ]
      * @dev Get the decimals of the Token
      * @return _decimals
      */
    function decimals() external view returns(uint8) {
        return _decimals;
    }

    /** [ ERC-20 INTERFACE (4/5) ]
      * @dev Get the balance of a specific token holder
      * @param tokenHolder address of a token holder
      * @return balance
      */
    function balanceOf(address tokenHolder) external view returns (uint256) {
        uint256 balance;

        for (uint256 i=0; i < _partitionsOf[tokenHolder].length; i++) {
            bytes32 partition = _partitionsOf[tokenHolder][i];
            balance = balance.add(_balanceOfByPartition[tokenHolder][partition]);
        }

        return balance;
    }

    /** [ ERC-20 INTERFACE (5/5) ]
      * @dev Get the total supply of the Token
      * @return supply
      */
    function totalSupply() external view returns (uint256) {
        uint256 supply;

        for(uint256 i=0; i < _totalPartitions.length; i++) {
            bytes32 partition = _totalPartitions[i];
            supply = supply.add(_totalSupplyByPartition[partition]);
        }

        return supply;
    }

    /** @dev Get the NAV of the Token
      * @return _nav
      */
    function nav() external view returns(uint256) {
        return _nav;
    }

    /** @dev Get the decimals of NAV
      * @return _navDecimals
      */
    function navDecimals() external view returns(uint256) {
        return _navDecimals;
    }

    /** @dev Get the lot size
      * @return _lotSize
      */
    function lotSize() external view returns(uint256) {
        return _lotSize;
    }

    /** @dev Returns address of the ERC20 contract
      * @return _erc20
      */
    function erc20Contract() external view returns(address) {
        return _erc20;
    }
}
