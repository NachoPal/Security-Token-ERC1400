pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;

import '../ERC1400.sol';

/** @title ERC1643 standard */
contract ERC1643 is ERC1400 {

    //------------------ MODIFIERS ---------------------

    /** @dev Check if a document name exists
      * @param name of the document
      */
    modifier isDocument(bytes32 name) {
        require(
            _documents[name].name == name,
            "document does not exist"
        );
        _;
    }


    //------------------ EVENTS ---------------------

    /** @dev Event to log when a document is removed
      * @param name .
      * @param uri .
      * @param documentHash .
      */
    event DocumentRemoved(bytes32 indexed name, string uri, bytes32 documentHash);

    /** @dev Event to log when a document is created o updated
      * @param name .
      * @param uri .
      * @param documentHash .
      */
    event DocumentUpdated(bytes32 indexed name, string uri, bytes32 documentHash);


    //------------------ CONSTRUCTOR ---------------------

    /** @dev Constructor: Set inital documents associated to the Token
      * @param documents array of tuple Document with name, uri and hash
      */
    function initialize(Document[] memory documents) public {
        for(uint256 i=0; i < documents.length; i++) {
            setDocument(
                documents[i].name,
                documents[i].uri,
                documents[i].documentHash
            );
        }
    }


    //------------------ EXTERNAL ---------------------

    /** [ ERC-1643 INTERFACE (1/4) ]
      * @dev Remove document from Token
      * @param docuName .
      */
    function removeDocument(bytes32 docuName)
        isDocument(docuName)
        onlyIssuerOrController
        external
    {
        uint256 indexToRemove = _documents[docuName].index;
        bytes32 nameToMove = _documentsNames[_documentsNames.length-1];
        _documentsNames[indexToRemove] = nameToMove;
        _documents[nameToMove].index = indexToRemove;
        _documentsNames.length -= 1;

        emit DocumentRemoved(
            docuName,
            _documents[docuName].uri,
            _documents[docuName].documentHash
        );

        delete _documents[docuName];
    }

    /** [ ERC-1643 INTERFACE (2/4) ]
      * @dev Get document values
      * @param docuName .
      * @return uri, docuemntHash and timestamp
      */
    function getDocument(bytes32 docuName)
        external
        view
        returns (string memory, bytes32, uint256)
    {
        return(
            _documents[docuName].uri,
            _documents[docuName].documentHash,
            _documents[docuName].timeStamp
        );
    }

    /** [ ERC-1643 INTERFACE (3/4) ]
      * @dev Get a list of all documents names
      */
    function getAllDocuments() external view returns(bytes32[] memory) {
        return _documentsNames;
    }

    /** @dev Returns address of the ERC1643 contract
      * @return _erc1644
      */
    function erc1643Contract() external view returns(address) {
        return _erc1643;
    }


    //------------------ PUBLIC ---------------------

    /** [ ERC-1643 INTERFACE (4/4) ]
      * @dev Attach or update a document to the Token with a timestamp
      * @param docuName .
      * @param uri "https://website.com/documents/"
      * @param documentHash hash of the document representing keccak256(documentBytes)
      */
    function setDocument(
        bytes32 docuName,
        string memory uri,
        bytes32 documentHash
    )
        onlyIssuerOrController
        public
    {
        _documents[docuName].uri = uri;
        _documents[docuName].documentHash = documentHash;
        _documents[docuName].timeStamp = now;

        if(_documents[docuName].name != docuName) {
            _documents[docuName].name = docuName;
            _documents[docuName].index = _documentsNames.push(docuName)-1;
        }

        emit DocumentUpdated(docuName, uri, documentHash);
    }
}
