pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;


contract Proxy {

  address internal _token;

  constructor(address token) public {
    _token = token;
  }

  //---------------------- ERC1643 --------------------------------
  function setDocument(
      bytes32 docuName,
      string memory uri,
      bytes32 documentHash
  )
      public
  {
    address(_token).call(msg.data);
    /* address(_token).call(
        abi.encodeWithSignature(
            "setDocument(bytes32,string,bytes32)",
            docuName, uri, documentHash
        )
    ); */
  }

  function getDocument(bytes32 docuName) external view returns(bytes32) {
    /* (bool valid, bytes memory returnData) = address(_token).staticcall(
        abi.encodeWithSignature(
            "getDocument(bytes32)",
            docuName
        )
    ); */

    (bool valid, bytes memory returnData) = address(_token).staticcall(msg.data);
    (bytes32 _docuName) = abi.decode(returnData,(bytes32));

    return _docuName;
  }

  function removeDocument(bytes32 docuName) public {
    address(_token).call(
        abi.encodeWithSignature(
            "removeDocument(bytes32)",
            docuName
        )
    );
  }

  function getAllDocuments() external view returns (bytes32[] memory) {
    (bool valid, bytes memory returnData) = address(_token).staticcall(
        abi.encodeWithSignature("getAllDocuments()")
    );

    //(bool valid, bytes memory returnData) = address(_token).staticcall(msg.data);

    (bytes32[] memory _docuName) = abi.decode(returnData,(bytes32[]));
    return _docuName;
  }




  function name() external view returns(string memory) {
    (bool valid, bytes memory returnData) = address(_token).staticcall(
        abi.encodeWithSignature(
            "name()",
            ""
        )
    );

    (string memory _name) = abi.decode(returnData, (string));
    return _name;
  }
}
