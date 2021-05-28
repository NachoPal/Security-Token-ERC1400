pragma solidity 0.5.2;

/**
 * @title Ownable
 * @dev The Ownable contract has an issuer address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {

    //------------------ MODIFIERS ---------------------

    /**
     * @dev Throws if called by any account other than the issuer.
     */
    modifier onlyIssuer() {
        require(_isIssuer(), "invalid issuer");
        _;
    }


    //------------------ EVENTS ---------------------

    /** @dev Event emitted when issuer owner is changed
      * @param previousIssuer .
      * @param newIssuer .
      */
    event IssuerTransferred(address indexed previousIssuer, address indexed newIssuer);


    //------------------ STATE VARIABLES ---------------------

    address internal _issuer;



    //------------------ CONSTRUCTOR ---------------------

    /**
     * @dev Constructor: The Ownable constructor sets the original `issuer`
     * of the contract to the sender account.
     */
    constructor() public {
        _issuer = msg.sender;
        emit IssuerTransferred(address(0), _issuer);
    }


    //------------------ EXTERNAL ---------------------

    /**
     * @dev Allows the current issuer to transfer control of the contract to a newIssuer.
     * @param newIssuer The address to transfer ownership to.
     */
    function transferOwnership(address newIssuer) external onlyIssuer {
      require(newIssuer != address(0), "invalid 0x00 address");
      emit IssuerTransferred(_issuer, newIssuer);
      _issuer = newIssuer;
    }

    function issuer() external view returns(address) {
      return _issuer;
    }


    //------------------ INTERNAL ---------------------

    /**
     * @dev Return if is a issuer
     * @return true if `msg.sender` is the issuer of the contract.
     */
    function _isIssuer() internal view returns (bool) {
        return msg.sender == _issuer;
    }
}
