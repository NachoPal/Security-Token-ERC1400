pragma solidity 0.5.2;

import "./Ownable.sol";
import "./Utils.sol";

/**
 * @title Controllable
 * @dev The Controllable contract provides basic control functions
 * for an Issuer to autohorize or revoke Controllers
 */
contract Controllable is Ownable {

    using Utils for bytes32;

    //------------------ MODIFIERS ---------------------

    /**
     * @dev Throws if called by any account other than the issuer.
     */
    modifier onlyIssuer() {
        require(_isIssuer(), "invalid issuer");
        _;
    }

    /**
     * @dev Throws if called by any account other than a controller.
     */
    modifier onlyController() {
        require(_isController(), "invalid controller");
        _;
    }

    /**
     * @dev Throws if called by any account other than the issuer or a controller.
     */
    modifier onlyIssuerOrController() {
        require(_isIssuer() || _isController(), "invalid issuer or controller");
        _;
    }


    //------------------ EVENTS ---------------------

    /** @dev Event emitted when a controller has resigned control
      * @param controller address
      */
    event ControllerResigned(address indexed controller);

    /** @dev Event emitted when a new controller is authorized
      * @param issuer address of the issuer who authorized new controller
      * @param newController address
      */
    event ControllerAuthorized(address indexed issuer, address indexed newController);

    /** @dev Event emitted when a controller is revoked
      * @param issuer address of the issuer who revoked the controller
      * @param oldController address
      */
    event ControllerRevoked(address indexed issuer, address indexed oldController);


    //------------------ STATE VARIABLES ---------------------

    mapping(address => bool) internal _controllers;

    address[] internal _controllersList;

    address internal _certificateController;

    bytes32 constant internal NONCES_MAPPING_POSITION_CONTROLLER = keccak256("certificate.controller.mapping.nonce");


    //------------------ EXTERNAL ---------------------
    /**
     * @dev Allows the current issuer to authorize a new cotroller
     * @param controller The address of the controller to authorize.
     * @param controllerData signed certificate aproving action
     */
    function authorizeController(
        address controller,
        bytes calldata controllerData
    )
        external
        onlyIssuer
    {
        require(controller != address(0), "invalid 0x00 address");

        bytes32 response = _registerCertificateController(controllerData, controller);
        require(response == bytes32(0), (response).toString());

        _controllers[controller] = true;
        _controllersList.push(controller);

        emit ControllerAuthorized(msg.sender, controller);
    }

    /**
     * @dev Allows the current issuer to revoke a current controller
     * @param controller The address of the controller to revoke.
     * @param controllerData signed certificate aproving action
     */
    function revokeController(
        address controller,
        bytes calldata controllerData
    )
        external
        onlyIssuer
    {
        require(_controllers[controller], "invalid controller");
        require(_controllersList.length > 2, "should be at least two controllers");

        bytes32 response = _registerCertificateController(controllerData, controller);
        require(response == bytes32(0), (response).toString());

        _controllers[controller] = false;
        _removeController(controller);

        emit ControllerRevoked(msg.sender, controller);
    }

    /**
     * @dev Allows a Controller to relinquish control of the contract.
     */
    function renounceControl() external onlyController {
        require(_controllersList.length > 2, "should be at least two controllers");
        _controllers[msg.sender] = false;
        _removeController(msg.sender);

        emit ControllerResigned(msg.sender);
    }

    /** @dev Return list of all authorized controllers */
    function controllers() external view returns(address[] memory) {
        return _controllersList;
    }

    /**
     * @dev Allows a Controller to relinquish control of the contract.
     */
    function isController(address controller) public view returns(bool) {
        return _controllers[controller];
    }

    /** @dev Get next valid certificate nonce */
    function certificateControllerNonce() external view returns(uint256 nonce) {
        bytes32 position = keccak256(abi.encode(NONCES_MAPPING_POSITION_CONTROLLER));
        assembly {
            nonce := sload(position)
        }
    }


    //------------------ INTERNAL ---------------------

    /**
     * @return true if `msg.sender` is a controller of the contract.
     */
    function _isController() internal view returns(bool) {
        return _controllers[msg.sender];
    }

    /** @dev Register a certificate
      * @param controllerData signed certificate to aprrove action
      * @param newController addres of the new controller to be authorised or revoked
      * @return bytes32 explaining if the certificate is valid or not anf why (reason)
      */
    function _registerCertificateController(
        bytes memory controllerData,
        address newController
    )
        internal
        returns(bytes32)
    {
        (/*bool valid*/, bytes memory returnData) = address(_certificateController).delegatecall(
            abi.encodeWithSignature(
                "register(bytes,address,address[])",
                controllerData,
                newController,
                _controllersList
            )
        );

        return abi.decode(returnData, (bytes32));
    }

    function _removeController(address controller) internal {
        for(uint256 i=0; i < _controllersList.length; i++) {
            if(_controllersList[i] == controller) {
                _controllersList[i] = _controllersList[_controllersList.length - 1];
                _controllersList.length --;
                break;
            }
        }
    }
}
