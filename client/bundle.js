(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const analyzeHoldem = require('./lib/holdem')

/**
 * Analyzes a given PokerHand which has been parsed by the HandHistory Parser hhp.
 * Relative player positions are calculated, i.e. cutoff, button, etc.
 * Players are included in order of action on flop.
 *
 * The analyzed hand then can be visualized by [hhv](https://github.com/thlorenz/hhv).
 *
 * For an example of an analyzed hand please view [json output of an analyzed
 * hand](https://github.com/thlorenz/hhv/blob/master/test/fixtures/holdem/actiononall.json).
 *
 * @name analyze
 * @function
 * @param {object} hand hand history as parsed by [hhp](https://github.com/thlorenz/hhp)
 * @return {object} the analyzed hand
 */
exports = module.exports = function analyze(hand) {
  if (!hand.info) throw new Error('Hand is missing info')
  if (hand.info.pokertype === 'holdem') return analyzeHoldem(hand)
}

exports.script     = require('./lib/script')
exports.storyboard = require('./lib/storyboard')
exports.summary     = require('./lib/summary')

exports.strategicPositions = require('./lib/strategic-positions').list

function wasActive(x) {
  return x.preflop[0] && x.preflop[0].type !== 'fold'
}

/**
 * Filters all players who didn't act in the hand or just folded.
 *
 * @name filterInactives
 * @function
 * @param {Array.<Object>} players all players in the hand
 * @return {Array.<Object>} all players that were active in the hand
 */
exports.filterInactives = function filterInactives(players) {
  if (players == null) return []
  return players.filter(wasActive)
}


},{"./lib/holdem":2,"./lib/script":3,"./lib/storyboard":4,"./lib/strategic-positions":5,"./lib/summary":6}],2:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'
const cardOrder = [ '2', '3', '4', '5', '6', '7', '8', 'T', 'J', 'Q', 'K', 'A' ]
const strategicPositions = require('./strategic-positions')

function round(n) {
  return Math.round(n * 10) / 10
}

function notmetadata(k) {
  return k !== 'metadata'
}

function copyValues(o) {
  function copy(acc, k) {
    acc[k] = o[k]
    return acc
  }
  if (!o) return o
  return Object.keys(o)
    .filter(notmetadata)
    .reduce(copy, {})
}

function normalizeHoleCards(hc) {
  if (!hc) return hc
  const c1 = hc.card1
  const c2 = hc.card2
  if (c1 == null || c2 == null) return hc
  // show large card before smaller card
  return cardOrder.indexOf(c1[0]) < cardOrder.indexOf(c2[0])
    ? { card1: c2, card2: c1 } : { card1: c1, card2: c2 }
}

function getStartingPot(o, playerCount) {
  const totalAnte = (o.ante || 0) * playerCount
  return  (o.sb || 0) + (o.bb || 0) + totalAnte
}

function postFlopOrderFromPreflopOrder(n, playerCount) {
  // headsup just reverses the order
  if (playerCount === 2) return n === 0 ? 1 : 0

  if (n === (playerCount - 1)) return 1 // BB
  if (n === (playerCount - 2)) return 0 // SB
  return n + 2
}
function byPostFlopOrder(p1, p2) {
  return p1.postflopOrder - p2.postflopOrder
}

function sortPlayersByPostFlopOrder(players) {
  function appendPlayer(acc, k) {
    const p = players[k]
    p.name = k
    acc.push(p)
    return acc
  }
  return Object.keys(players)
    .reduce(appendPlayer, [])
    .sort(byPostFlopOrder)
}

function playerInvested(preflop) {
  for (var i = 0; i < preflop.length; i++) {
    const action = preflop[i].type
    if (action === 'bet' || action === 'call' || action === 'raise') return true
  }
  return false
}

function playerSawShowdown(p) {
  if (p.showdown.length) return true
  if (p.river.length && p.river[p.river.length - 1].type !== 'fold') return true
  return false
}

function addActivityInfo(players, info) {
  var anyInvested    = false
  var anySawFlop     = false
  for (var i = 0; i < players.length; i++) {
    const player       = players[i]
    player.invested    = player.sb || player.bb || playerInvested(player.preflop)
    player.sawFlop     = !!player.flop.length
    player.sawShowdown = playerSawShowdown(player)

    if (!anyInvested) anyInvested = player.invested
    if (!anySawFlop) anySawFlop   = player.sawFlop
  }

  info.anyInvested    = anyInvested
  info.anySawFlop     = anySawFlop
}

function updateChips(prev, current, investeds, players, hand) {
  Object.keys(players)
    .forEach(updatePlayerChips, { prev: prev, current: current })

  function updatePlayerChips(k) {
    const p = players[k]
    var chips = p[this.prev] - (investeds[k] || 0)
    if (this.prev === 'chipsPreflop') {
      if (p.bb) chips += hand.info.bb
      if (p.sb) chips += hand.info.sb
    }
    p.chipsAfter = p[this.current] = chips
  }
}

function updateChipsForAction(chips, action, cost, player) {
  action.chips = chips[player]
  chips[player] -= cost
  action.chipsAfter = chips[player]
}

function positionPlayer(player, playerCount, idx) {
  player.preflopOrder = idx
  player.postflopOrder = postFlopOrderFromPreflopOrder(idx, playerCount)
  const positions = strategicPositions(idx, playerCount)
  player.pos = positions.pos
  player.exactPos = positions.exactPos
}

function assignPosition(player, playerCount, idx) {
  if (player.hasOwnProperty('preflopOrder')) return
  positionPlayer(player, playerCount, idx)
}

module.exports = function analyzeHoldem(hand) {
  var pot = 0
  var currentBet = hand.info.bb

  const playerCount = hand.seats.length
  const startingPot = getStartingPot(hand.info, playerCount)

  const players = {}
  const analyzed = {
      info    : copyValues(hand.info)
    , table   : copyValues(hand.table)
    , board   : copyValues(hand.board)
    , hero    : hand.hero
  }
  if (analyzed.info.ante == null) analyzed.info.ante = 0
  analyzed.pots = {
    preflop: startingPot
  }
  analyzed.info.players = playerCount

  for (var i = 0; i < playerCount; i++) {
    const s = hand.seats[i]
    const player = {
        seatno        : s.seatno
      , chips         : s.chips
      , chipsPreflop  : s.chips
      , chipsFlop     : NaN
      , chipsTurn     : NaN
      , chipsRiver    : NaN
      , chipsShowdown : NaN
      , chipsAfter    : NaN
      , m             : Math.round(s.chips / startingPot)
      , preflop       : []
      , flop          : []
      , turn          : []
      , river         : []
      , showdown      : []
    }
    if (hand.table.button === s.seatno) player.button = true
    if (hand.hero === s.player) {
      player.hero = true
      if (hand.holecards) {
        player.cards = normalizeHoleCards(hand.holecards)
      }
    }
    players[s.player] = player
  }
  analyzed.players = players

  for (i = 0; i < hand.posts.length; i++) {
    const p = hand.posts[i]
    const player = players[p.player]
    pot += p.amount
    player.chipsAfter = player.chipsPreflop -= p.amount

    if (p.type === 'sb') player.sb = true
    if (p.type === 'bb') player.bb = true
  }

  function analyzeAction(p, invested, chips) {
    const startingPot = pot
    var cost = 0
    var betDelta = 0
    const action = {
      type: p.type
    }
    if (p.type === 'raise') {
      action.ratio = round(p.raiseTo / currentBet)
      action.allin = !!p.allin
      action.amount = p.raiseTo - invested
      betDelta = 1
      currentBet = p.raiseTo
      pot += currentBet
      cost = action.amount
    } else if (p.type === 'bet') {
      action.ratio = round(p.amount / pot)
      action.allin = !!p.allin
      action.amount = p.amount
      currentBet = p.amount
      pot += currentBet
      cost = action.amount
    } else if (p.type === 'call') {
      action.ratio = round(p.amount / pot)
      action.allin = !!p.allin
      action.amount = p.amount
      pot += p.amount
      cost = action.amount
    } else if (p.type === 'collect') {
      action.ratio = round(p.amount / pot)
      action.allin = false
      action.amount = p.amount
      cost = -p.amount
      pot = 0
    } else if (p.type === 'bet-returned') {
      action.ratio = round(p.amount / pot)
      action.allin = false
      action.amount = p.amount
      cost = -p.amount
      pot = pot - p.amount
    }
    action.pot = startingPot
    action.potAfter = startingPot + cost
    action.chips = chips
    action.chipsAfter = chips - cost
    return { action: action, cost: cost || 0, betDelta: betDelta }
  }

  var investeds = {}
  var chips = {}
  // starting with one bet, first raise is two bet, next three bet and so on
  var bet = 1

  function startPreflopCost(p) {
    if (p.bb) return hand.info.bb
    if (p.sb) return hand.info.sb
    return 0
  }

  function adjustBet(info) {
    bet = bet + info.betDelta
    info.action.bet = bet
  }

  //
  // Preflop
  //
  for (i = 0; i < hand.preflop.length; i++) {
    const p = hand.preflop[i]
    const player = players[p.player]
    const invested = investeds[p.player] || startPreflopCost(player)
    if (typeof chips[p.player] === 'undefined') chips[p.player] = player.chipsPreflop

    const info = analyzeAction(p, invested)
    adjustBet(info)

    player.preflop.push(info.action)
    assignPosition(player, playerCount, i)
    investeds[p.player] = invested + info.cost
    updateChipsForAction(chips, info.action, info.cost, p.player)
  }
  updateChips('chipsPreflop', 'chipsFlop', investeds, players, hand)

  //
  // Flop
  //
  analyzed.pots.flop = pot
  investeds = {}
  bet = 1
  for (i = 0; i < hand.flop.length; i++) {
    const p = hand.flop[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    adjustBet(info)

    player.flop.push(info.action)
    investeds[p.player] = invested + info.cost
    updateChipsForAction(chips, info.action, info.cost, p.player)
  }
  updateChips('chipsFlop', 'chipsTurn', investeds, players, hand)

  //
  // Turn
  //
  analyzed.pots.turn = pot
  investeds = {}
  bet = 1
  for (i = 0; i < hand.turn.length; i++) {
    const p = hand.turn[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    adjustBet(info)

    player.turn.push(info.action)
    investeds[p.player] = invested + info.cost
    updateChipsForAction(chips, info.action, info.cost, p.player)
  }
  updateChips('chipsTurn', 'chipsRiver', investeds, players, hand)

  //
  // River
  //
  analyzed.pots.river = pot
  investeds = {}
  bet = 1
  for (i = 0; i < hand.river.length; i++) {
    const p = hand.river[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    adjustBet(info)

    player.river.push(info.action)
    investeds[p.player] = invested + info.cost
    updateChipsForAction(chips, info.action, info.cost, p.player)
  }
  updateChips('chipsRiver', 'chipsShowdown', investeds, players, hand)

  //
  // Showdown
  //
  analyzed.pots.showdown = pot
  // first we aggregate all collections and then condense into one action
  var collecteds = {}
  for (i = 0; i < hand.showdown.length; i++) {
    const p = hand.showdown[i]
    const player = players[p.player]
    // in some rare cases we removed a player that had no active involvemement in the hand
    // i.e. if he was allin after posting
    if (player == null) continue

    if ((p.type === 'show' || p.type === 'muck') &&
      player.cards == null && p.card1 != null && p.card2 != null) {
      player.cards = normalizeHoleCards({ card1: p.card1, card2: p.card2 })
    } else if (p.type === 'collect') {
      collecteds[p.player] = (collecteds[p.player] || 0) + p.amount
    }
  }

  Object.keys(collecteds).forEach(processCollecteds)
  function processCollecteds(k) {
    const player = players[k]
    const amount = collecteds[k]
    const ratio = round(amount / pot)
    const action = {
        type       : 'collect'
      , ratio      : ratio
      , winall     : ratio === 1
      , amount     : amount
      , chips      : chips[k]
      , chipsAfter : chips[k] + amount
    }
    player.showdown.push(action)
    player.chipsAfter += amount
  }

  // In some rare cases a player is allin after posting and doesn't act at all
  // In that case we just pretend that player never existed since he's not important
  // to analyze the hand and is problematic to assign a position to at this point
  const playerKeys = Object.keys(players)
  for (i = 0; i < playerKeys.length; i++) {
    const key = playerKeys[i]
    const player = players[key]
    if (player == null || player.preflopOrder == null) delete players[key]
  }

  // Some cards are only exposed in showdown (seen for mucked hands), so let's try to
  // capture the ones we didn't so far.
  if (hand.summary != null) {
    for (i = 0; i < hand.summary.length; i++) {
      const p = hand.summary[i]
      const player = players[p.player]
      if (player == null) continue

      if ((p.type === 'show' || p.type === 'showed' || p.type === 'muck') &&
        player.cards == null && p.card1 != null && p.card2 != null) {
        player.cards = normalizeHoleCards({ card1: p.card1, card2: p.card2 })
      }
    }
  }

  analyzed.players = sortPlayersByPostFlopOrder(players)
  addActivityInfo(analyzed.players, analyzed.info)
  return analyzed
}

},{"./strategic-positions":5}],3:[function(require,module,exports){
'use strict'

function ignoreStreets(p) {
  function copy(acc, k) {
    if (k === 'preflop' || k === 'flop' || k === 'turn' || k === 'river' || k === 'showdown') return acc
    acc[k] = p[k]
    return acc
  }
  return Object.keys(p).reduce(copy, {})
}

function addIndex(p, idx) {
  p.index = idx
}

function byPreflopOrder(p1, p2) {
  return p1.preflopOrder - p2.preflopOrder
}

function byPostflopOrder(p1, p2) {
  return p1.postflopOrder - p2.postflopOrder
}

function addAction(actions, action, player) {
  actions.push({ action: action, playerIndex: player.index })
}

function addStreet(acc, streetName, ps) {
  const actions = []
  const chipsInFronts = new Array(ps.length).fill(0)
  let ia = 0
  let keepGoing = true
  const ispreflop = streetName === 'preflop'
  while (keepGoing) {
    keepGoing = false
    for (var ip = 0; ip < ps.length; ip++) {
      const p = ps[ip]
      if (ispreflop) {
        chipsInFronts[ip] = p.chipsInFront
      }
      const street = p[streetName]
      const action = street.length > ia && street[ia]
      keepGoing = keepGoing || !!action
      if (action) {
        addAction(actions, action, p)
        if (typeof action.amount === 'number') {
          chipsInFronts[ip] += action.amount
        }
        action.chipsInFront = chipsInFronts[ip]
      }
    }
    ia++
  }
  acc[streetName] = actions
}

/**
 * Scripts what happened in a hand into a actions script array.
 * This array can be read top down to replay the hand.
 *
 * The players and info fields from the analyzed data are copied over.
 * Each action includes the index at which the player that's executing
 * the action can be found in the players array.
 *
 * Structure of returned object:
 *
 * ```
 * info: object containing hand info
 * table: object containing info about the table like total seats
 * board: object cards on the board
 * players: array of all players at the table including all info about their stacks
 * actions:
 *  preflop  : array of preflop actions
 *  flop     : array of flop actions
 *  turn     : array of turn actions
 *  river    : array of river actions
 *  showdown : array of showdown actions
 * ```
 *
 * @name hha.script
 * @function
 * @param {object} data analyzed hand data @see hha()
 * @return {object}
 */
module.exports = function script(data) {
  const hand = {
      info: data.info
    , table: data.table
    , board: data.board
    , pots: data.pots
  }

  function addChipsInFront(p) {
    if (p.sb) {
      p.chipsInFront = data.info.sb
    } else if (p.bb) {
      p.chipsInFront = data.info.bb
    } else {
      p.chipsInFront = 0
    }
    return p
  }

  data.players.forEach(addChipsInFront)
  hand.players = data.players.map(ignoreStreets)

  data.players.forEach(addIndex)

  const actions = {}
  // preflop
  data.players.sort(byPreflopOrder)
  addStreet(actions, 'preflop', data.players)

  // flop, turn, river, showdown
  data.players.sort(byPostflopOrder)
  addStreet(actions, 'flop', data.players)
  addStreet(actions, 'turn', data.players)
  addStreet(actions, 'river', data.players)
  addStreet(actions, 'showdown', data.players)

  hand.actions = actions
  return hand
}

},{}],4:[function(require,module,exports){
'use strict'

const putMoneyIn = {
    fold    : false
  , check   : false
  , collect : false
  , post    : true
  , call    : true
  , bet     : true
  , raise   : true
}

const cardsOnBoard = {
    preflop  : 0
  , flop     : 3
  , turn     : 4
  , river    : 5
  , showdown : 5
}

/**
 * Takes a script of actions and calculates the states for each.
 * Adds pointers to the state at the beginning of each script.
 *
 * This is useful if you try to jump around in the hand and reset
 * the state of the table.
 *
 * @name hha.storyboard
 * @function
 * @param {Object} script created via @see hha:script
 */
module.exports = function storyboard(script) {
  const states = []

  //
  // initially
  //
  function getVal(acc, k) {
    if (script.board[k]) acc.push(script.board[k])
    return acc
  }

  const board = script.board && Object.keys(script.board).reduce(getVal, []) || []

  // will be sparse if not all players present
  let seats = new Array(script.table.maxseats + 1)
  function addSeat(p, idx) {
    seats[p.seatno] = {
        chips       : p.chipsPreflop
      , name        : p.name
      , m           : p.m
      , sb          : p.sb
      , bb          : p.bb
      , button      : p.button
      , action      : null
      , amount      : 0
      , chipsInFront: p.chipsInFront
      , bet         : 0
      , investedBet : p.bb ? 1 : 0
      , holecards   : p.cards || { card1 : '??', card2 : '??' }
      , playerIdx   : idx
      , seatno      : p.seatno
    }
  }
  script.players.forEach(addSeat)

  //
  // From now on we always map seats even though we reuse the variable
  // in order to avoid affecting previous states
  //

  function resetSeat(s) {
    const street = this.street
    const stage  = this.stage

    const preflop = street === 'preflop'
    const chipsName = 'chips' + street[0].toUpperCase() + street.slice(1)
    const p = script.players[s.playerIdx]
    const chips = p[chipsName]
    return Object.assign({}, seats[p.seatno], {
        chips       : chips
      , action      : null
      , amount      : 0
      , chipsInFront: preflop ? p.chipsInFront : 0
      , bet         : 0
      , investedBet : preflop && p.bb ? 1 : 0
      , _lastUpdate : stage
    })
  }

  function adaptSeat(s, idx) {
    const p = this.p
    const a = this.a
    const stage = this.stage
    if (typeof s === 'undefined' || p.seatno !== idx) return s

    // cards are not at player's seat anymore after he folded
    const folded = a.type === 'fold'
    const holecards = folded ? null : s.holecards
    const investedBet = putMoneyIn[a.type] ? a.bet : s.investedBet
    return Object.assign({}, s, {
        chips       : a.chipsAfter
      , action      : a.type
      , amount      : a.amount
      , chipsInFront: a.chipsInFront
      , bet         : a.bet || 0
      , investedBet : investedBet || 0
      , holecards   : holecards
      , folded      : folded
      , _lastUpdate : stage
    })
  }

  let streetIdxs = {
      preflop  : null
    , flop     : null
    , turn     : null
    , river    : null
    , showdown : null
  }

  const folded = {}

  function addFolded() {
    for (var i = 0; i < seats.length; i++) {
      const s = seats[i]
      if (s && s.folded) folded[s.seatno] = true
    }
  }

  function collectAction(street) {
    const flop = street === 'flop'
    function tocollect(acc, s) {
      if (folded[s.seatno]) return acc

      // small blinds posted and their bet size is 0 (half a blind)
      // however if they invested more we'll use that amount
      if (s.sb && flop) {
        acc.push({ seatno: s.seatno, bet: s.investedBet || 0 })

      // big blinds need to have their big blind collected at least
      } else if (s.bb) {
        acc.push({ seatno: s.seatno, bet: Math.max(1, (s.investedBet || 0)) })

      // all others have no chips in front of them if they didn't invest
      } else if (s.investedBet) {
        acc.push({ seatno: s.seatno, bet: s.investedBet })
      }
      return acc
    }

    return seats.reduce(tocollect, [])
  }

  function withHolecards(x) {
    return x && !!x.holecards
  }

  function isButton(x) {
    return x && !!x.button
  }

  function getSeatno(x) {
    return x.seatno
  }

  function getStage(street, i) {
    // account for the fact that the first showdown stage already has an action
    if (street !== 'showdown') return street + '+' + (i + 1)
    return i === 0 ? street : street + '+' + i
  }

  function processStreet(street) {
    const actions = script.actions[street]
    const onboard = cardsOnBoard[street] || 0
    const currentBoard = board.slice(0, onboard)
    const preflop = street === 'preflop'
    const showdown = street === 'showdown'

    // collect chips first if we made it to flop, turn, river or showdown
    const collect = !preflop ? collectAction() : []
    // mark folded players so we don't collect their chips again on next street
    addFolded()

    seats = seats.map(resetSeat, { street: street, stage: street })
    const dealerAction = {
      collect: collect
    }
    if (!preflop && !showdown) {
      dealerAction.board = {
          street: street
        , onboard: cardsOnBoard[street]
      }
    }

    if (preflop) {
      const button = seats.filter(isButton).map(getSeatno)[0]
      dealerAction.dealtCards = {
        seatnos: seats.filter(withHolecards).map(getSeatno)
      }
      if (button) {
        dealerAction.button = {
          seatno: button
        }
      }
    }

    // This state is identical to the first action on the street, except the
    // action hasn't executed.
    // Thus it clears up all chips in front of the players and adds cards
    // to the board.
    // Don't create this for the showdown though since nothing visibly changes here
    // until the next player action occurs.
    if (street !== 'showdown') {
      states.push({
          board        : currentBoard
        , boardChanged : true
        , pot          : script.pots[street]
        , action       : false
        , stage        : street
        , seats        : seats
        , dealerAction : dealerAction
      })
      streetIdxs[street] = states.length - 1
    } else {
      // showdown points to first action in it
      streetIdxs[street] = states.length
    }

    if (!actions.length) {
      // make sure we play to showdown in case all players are allin
      return currentBoard.length >= cardsOnBoard[street]
    }

    for (var i = 0; i < actions.length; i++) {
      const action = actions[i]
      const p = script.players[action.playerIndex]
      const a = action.action
      const stage = getStage(street, i)

      seats = seats.map(adaptSeat, { p: p, a: a, stage: stage })
      action.seatno = p.seatno
      const state = {
          board        : currentBoard
        , boardChanged : false
        , pot          : street === 'showdown' ? 0 : a.potAfter
        , action       : action
        , stage        : stage
        , seats        : seats
      }
      // for showdown we combine the dealer action with whatever
      // else is going on, i.e. winner collecting money
      if (street === 'showdown') {
        // reveal cards on last showdown state
        if (i === actions.length - 1) {
          dealerAction.holecards = {
            reveal: true
          }
          state.dealerAction = dealerAction
        }
      }
      states.push(state)
    }
    return true
  }

  let more = processStreet('preflop')
  if (more) more = processStreet('flop')
  if (more) more = processStreet('turn')
  if (more) more = processStreet('river')
  if (more) processStreet('showdown')

  return {
      info    : script.info
    , players : script.players
    , board   : script.board
    , pots    : script.pots
    , states  : states
    , streets : streetIdxs
  }
}

},{}],5:[function(require,module,exports){
'use strict'

/* eslint-disable camelcase */
//            [ exact, range ]
const sb     = [ 'sb', 'sb' ]
const bb     = [ 'bb', 'bb' ]
const utg    = [ 'utg', 'ea' ]
const utg1   = [ 'utg+1', 'ea' ]
const utg2   = [ 'utg+2', 'ea' ]
const mp     = [ 'mp', 'mp' ]
const lj     = [ 'lj', 'mp' ]
const hj     = [ 'hj', 'lt' ]
const co     = [ 'co', 'co' ]
const bu     = [ 'bu', 'bu' ]

// 0 based .. substract 2
const table = [
    // headsup
    [ sb, bb ]
    // 3 players
  , [ bu, sb, bb ]
    // 4 players
  , [ co, bu, sb, bb ]
    // 5 players
  , [ utg, co, bu, sb, bb ]
    // 6 players
  , [ utg, utg1, co, bu, sb, bb ]
    // 7 players
  , [ utg, utg1, hj, co, bu, sb, bb ]
    // 8 players
  , [ utg, utg1, lj, hj, co, bu, sb, bb ]
    // 9 players
  , [ utg, utg1, utg2, lj, hj, co, bu, sb, bb ]
    // 10 players
  , [ utg, utg1, utg2, mp, lj, hj, co, bu, sb, bb ]
]

// Determined  by number of active players at table
// using acting order preflop
exports = module.exports = function strategicPositions(order, activePlayers) {
  // in one case we saw the order too large for the given active players
  const noplayers = Math.max(activePlayers - 2, order - 1)
  const cell = table[noplayers][order]
  return {
      exactPos: cell[0]
    , pos: cell[1]
  }
}

// ordered by postflop position
exports.list = [ 'sb', 'bb', 'ea', 'mp', 'lt', 'co', 'bu' ]

},{}],6:[function(require,module,exports){
'use strict'

function getHeader(hand) {
  const info = hand.info
  const table = hand.table
  const res = {
      room      : info.room
    , gametype  : info.gametype
    , currency  : info.currency || '$'
    , donation  : info.donation != null ? info.donation : 10
    , rake      : info.rake != null     ? info.rake     : 1
    , pokertype : info.pokertype
    , limit     : info.limit
    , sb        : info.sb
    , bb        : info.bb
    , ante      : info.ante
    , maxseats  : table.maxseats
  }

  if (info.level != null) res.level = info.level
  return res
}

function determinePosition(p) {
  return (
      p.exactPos != null ? p.exactPos
    : p.pos != null ? p.pos
    : `SEAT${p.seatno}`
  ).toUpperCase()
}

function amountInBB(amount, bb) {
  return Math.round(amount * 10 / bb) / 10
}

function getSeats(hand) {
  const bb = hand.info.bb
  const players = hand.players
  const seats = []
  var hero
  const preflopSummary = {}
  for (var i = 0; i < players.length; i++) {
    const p = players[i]
    const pos = determinePosition(p)
    const chipsBB = amountInBB(p.chips, bb)
    const chipsAmount = p.chips
    const seat = { pos: pos, chipsBB: chipsBB, chipsAmount: chipsAmount, hero: !!p.hero }
    if (seat.hero) {
      hero = seat
      hero.m = p.m
      preflopSummary.cards = p.cards
      preflopSummary.pos = seat.pos
    }
    seats.push(seat)
  }
  return { seats: seats, hero: hero, preflopSummary: preflopSummary }
}

function istourney(type) {
  return /tournament/.test(type)
}

function getChipStackRatio(gametype, bb, p) {
  const tourney = istourney(gametype)
  var label, amount
  if (tourney) {
    label = 'M'
    amount = p.m
  } else {
    label = 'BB'
    amount = p.chipsBB
  }
  return { label: label, amount: amount }
}

function activeAction(x) {
  return x.action.type !== 'collect' && x.action.type !== 'bet-returned'
}

function resolvePlayer(hand, idx) {
  return hand.players[idx]
}

function getPlayerActions(hand, actions) {
  var folds = 0
  const bb = hand.info.bb
  actions = actions.filter(activeAction)

  const playerActions = []

  for (var i = 0; i < actions.length; i++) {
    const action = actions[i]
    const a = action.action

    if (a.type === 'fold') {
      folds++
      continue
    }

    if (folds > 0) {
      playerActions.push({ type: 'folds', number: folds })
      folds = 0
    }

    const p = resolvePlayer(hand, action.playerIndex)
    const playerAction = { pos: determinePosition(p), type: a.type }
    if (a.type === 'call' || a.type === 'bet' || a.type === 'raise') {
      playerAction.amountBB = amountInBB(a.amount, bb)
      playerAction.amount = a.amount
    }

    playerActions.push(playerAction)
  }

  if (folds > 0) {
    playerActions.push({ type: 'folds', number: folds })
  }

  return playerActions
}

function resolvePlayersInvolved(actions) {
  const idxs = {}
  for (var i = 0; i < actions.length; i++) {
    const action = actions[i]
    idxs[action.playerIndex] = true
  }
  return Object.keys(idxs).length
}

function getFlopSummary(hand, bb) {
  const board = hand.board
  if (board == null) return null

  const card1 = board.card1
  const card2 = board.card2
  const card3 = board.card3
  if (card1 == null || card2 == null || card3 == null) return null

  const pot = hand.pots.flop
  const potBB = amountInBB(pot, bb)

  const playersInvolved = resolvePlayersInvolved(hand.actions.flop)

  return { pot: pot, potBB: potBB, board: [ card1, card2, card3 ], playersInvolved: playersInvolved }
}

function getTurnSummary(hand, bb) {
  const board = hand.board
  if (board == null) return null

  const card = board.card4
  if (card == null) return null

  const pot = hand.pots.turn
  const potBB = amountInBB(pot, bb)

  const playersInvolved = resolvePlayersInvolved(hand.actions.turn)

  return { pot: pot, potBB: potBB, board: card, playersInvolved: playersInvolved }
}

function getRiverSummary(hand, bb) {
  const board = hand.board
  if (board == null) return null

  const card = board.card5
  if (card == null) return null

  const pot = hand.pots.river
  const potBB = amountInBB(pot, bb)

  const playersInvolved = resolvePlayersInvolved(hand.actions.river)

  return { pot: pot, potBB: potBB, board: card, playersInvolved: playersInvolved }
}

function amounts(amount, bb) {
  return { amount: amount, bb: amountInBB(amount, bb) }
}

function getTotalPot(hand) {
  // basically looking for the largest number in the dumbest way possible :P (most likely also fastest)
  const bb = hand.info.bb
  const pots = hand.pots
  if (pots == null) return 0
  var max = 0
  if (pots.preflop == null) return amounts(max, bb)
  max = pots.preflop
  if (pots.flop == null) return amounts(max, bb)
  max = Math.max(max, pots.flop)
  if (pots.turn == null) return amounts(max, bb)
  max = Math.max(max, pots.turn)
  if (pots.river == null) return amounts(max, bb)
  max = Math.max(max, pots.river)
  if (pots.showdown == null) return amounts(max, bb)
  return amounts(Math.max(max, pots.showdown), bb)
}

function getSpoilers(players) {
  const spoilers = []
  for (var i = 0; i < players.length; i++) {
    const p = players[i]
    if (p.hero || p.cards == null || p.cards.card1 == null || p.cards.card2 == null) continue
    const pos = determinePosition(p)
    spoilers.push({ pos: pos, cards: p.cards })
  }
  return spoilers
}

/**
 * Converts a hand that was analyzed and then scripted to a summary representation.
 *
 * The summary has the following properties:
 *
 *  - header: contains game info, like room, pokertype, blinds, etc.
 *  - seats: lists the seats of the players including pos, chips and hero indicators
 *  - chipsStackRatio: hero's M for tournaments, his BBs for cash games
 *  - preflopSummary: hero's cards and position
 *  - preflopActions: action types + amounts of each player by position
 *  - flopSummary: pot at flop, board and playersInvolved
 *  - flopActions: same as preflopActions
 *  - turnSummary: pot at turn, turn card and playersInvolved
 *  - turnActions: same as preflopActions
 *  - riverSummary: pot at river, river card and playersInvolved
 *  - riverActions: same as preflopActions
 *  - totalPot: total money in the pot
 *  - spoilers: players whos cards are known by position
 *
 * @name hha.summary
 *
 * @function
 * @param {Object} script
 * @returns {Object} the hand summarized
 */
function summary(hand) {
  const res = {}
  if (hand.players == null || hand.players.length === 0) return res

  const bb = hand.info.bb

  res.header = getHeader(hand)
  const seatsInfo = getSeats(hand)
  res.seats = seatsInfo.seats
  res.chipStackRatio = seatsInfo.hero != null
    ? getChipStackRatio(res.header.gametype, res.header.bb, seatsInfo.hero)
    : null
  res.preflopSummary = seatsInfo.preflopSummary
  res.preflopActions = getPlayerActions(hand, hand.actions.preflop)

  if (hand.actions.flop != null && hand.actions.flop.length > 0) {
    res.flopSummary = getFlopSummary(hand, bb)
    res.flopActions = getPlayerActions(hand, hand.actions.flop)
  }

  if (hand.actions.turn != null && hand.actions.turn.length > 0) {
    res.turnSummary = getTurnSummary(hand, bb)
    res.turnActions = getPlayerActions(hand, hand.actions.turn)
  }

  if (hand.actions.river != null && hand.actions.river.length > 0) {
    res.riverSummary = getRiverSummary(hand, bb)
    res.riverActions = getPlayerActions(hand, hand.actions.river)
  }

  res.totalPot = getTotalPot(hand)
  res.spoilers = getSpoilers(hand.players)

  return res
}

module.exports = summary

},{}],7:[function(require,module,exports){
'use strict'

const stringUtil = require('./lib/util/string')

/* eslint-disable camelcase */
const holdem_ps = require('./lib/holdem/pokerstars')
const holdem_ig = require('./lib/holdem/ignition')

function getLines(txt) {
  const trimmed = txt.split('\n').map(stringUtil.trimLine)
  while (trimmed[0] && !trimmed[0].length) trimmed.shift()
  return trimmed
}

/**
 * Parses PokerHand Histories as output by the given online Poker Rooms.
 * Autodetects the game type and the PokerRoom.
 * So far PokerStars Holdem hands are supported.
 *
 * The parsed hands can then be further analyzed with the
 * [hha](https://github.com/thlorenz/hha) module.
 *
 * As an example [this
 * hand](https://github.com/thlorenz/hhp/blob/master/test/fixtures/holdem/pokerstars/actiononall.txt)
 * is parsed into [this object
 * representation](https://github.com/thlorenz/hha/blob/master/test/fixtures/holdem/actiononall.json).
 *
 * @name parse
 * @function
 * @param {string} input the textual representation of one poker hand as written to the HandHistory folder
 * @param {object=} opts various options
 * @param {boolean=} opts.infoOnly denotes that only the header line of the hand is parsed and only the info object returned
 * @param {string=} opts.buyinFile file name overrides buyin for rooms that don't include it in the history like Ignition
 * @return {object} representation of the given hand to be used as input for other tools like hha
 */
exports = module.exports = function parse(input, opts) {
  const lines = Array.isArray(input) ? input : getLines(input).filter(stringUtil.emptyLine)
  if (holdem_ps.canParse(lines)) return holdem_ps.parse(lines, opts)
  if (holdem_ig.canParse(lines)) return holdem_ig.parse(lines, opts)
}

/**
 * Extracts all hands from a given text file.
 *
 * @name extractHands
 * @function
 * @param {string} txt the text containing the hands
 * @return {Array.<Array>} an array of hands, each hand split into lines
 */
exports.extractHands = function extractHands(txt) {
  const lines = getLines(txt)
  const hands = []
  var hand = []

  var i = 0
  while (i < lines.length && lines[i] && !lines[i].length) i++   // ignore leading empty lines
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.length) {
      hand.push(line)
      // last hand that's not followed by empty line
      if (i === lines.length - 1 && hand.length) hands.push(hand)
    } else {
      // hand finished
      if (hand.length) hands.push(hand)
      hand = []
      while (i < lines.length && lines[i] && !lines[i].length) i++  // find start of next line
    }
  }
  return hands
}

},{"./lib/holdem/ignition":9,"./lib/holdem/pokerstars":10,"./lib/util/string":11}],8:[function(require,module,exports){
'use strict'

const stringUtil     = require('../util/string')
const safeParseInt   = stringUtil.safeParseInt
const safeParseFloat = stringUtil.safeParseFloat
const safeTrim       = stringUtil.safeTrim
const safeLower      = stringUtil.safeLower
const safeUpper      = stringUtil.safeUpper
const safeFirstUpper = stringUtil.safeFirstUpper
const priceFreeroll  = require('../util/tweaks').priceFreeroll

function HandHistoryParser(lines, opts) {
  if (!(this instanceof HandHistoryParser)) return new HandHistoryParser(lines, opts)

  this._lines = lines
  this._infoOnly = opts && opts.infoOnly

  this._posted      = false
  this._sawPreflop  = false
  this._sawFlop     = false
  this._sawTurn     = false
  this._sawRiver    = false
  this._sawShowdown = false
  this._sawSummary  = false

  this.hand = {
      seats    : []
    , posts    : []
    , preflop  : []
    , flop     : []
    , turn     : []
    , river    : []
    , showdown : []
    , summary  : []
  }

  // storage to piece together pieces in consistent order
  this._revealedCards = {}
}

var proto = HandHistoryParser.prototype
// Methods returning the rx for given gametype (tourney|cash)
proto._handInfoRx          = undefined
proto._tableInfoRx         = undefined

// Method that returns gametype of loaded hand
proto._gameType            = undefined

// Regexes that need to be implemented

// Hand Setup
proto._seatInfoRx          = undefined
proto._postRx              = undefined

// Street Indicators
proto._preflopIndicatorRx  = undefined
proto._streetIndicatorRx   = undefined
proto._showdownIndicatorRx = undefined
proto._summaryIndicatorRx  = undefined

// Street actions
proto._holecardsRx         = undefined
proto._actionRx            = undefined
proto._collectRx           = undefined
proto._betReturnedRx       = undefined

// Showdown (also uses _collectRx and _betReturnedRx)
proto._showRx              = undefined
proto._muckRx              = undefined
proto._finishRx            = undefined

// Summary
proto._summarySinglePotRx  = undefined
proto._summarySplitPotRx   = undefined
proto._summaryBoardRx      = undefined
proto._summaryMuckedRx     = undefined
proto._summaryCollectedRx  = undefined
proto._summaryShowedWonRx  = undefined
proto._summaryShowedLostRx = undefined
proto._summaryFoldedRx     = undefined

// Only applies to Ignition for now
proto._revealRx            = undefined

proto._preflopIndicator = function _preflopIndicator(line, lineno) {
  return this._preflopIndicatorRx.test(line)
}

proto._showdownIndicator = function _showdownIndicator(line, lineno) {
  return this._showdownIndicatorRx.test(line)
}

proto._summaryIndicator =  function _summaryIndicator(line, lineno) {
  return this._summaryIndicatorRx.test(line)
}

proto._identifyPokerType = function _identifyPokerType(s) {
  if (typeof s === 'undefined') return undefined
  return  (/hold'?em/i).test(s) ? 'holdem'
        : (/omaha/i).test(s)    ? 'omaha'
        : 'not yet supported'
}

proto._identifyLimit = function _identifyLimit(s) {
  if (typeof s === 'undefined') return undefined

  return  (/(no ?limit|nl)/i).test(s)  ? 'nolimit'
        : (/(pot ?limit|pl)/i).test(s) ? 'potlimit'
        : 'not yet supported'
}

proto._identifySummaryPosition = function _identifySummaryPos(s) {
  if (s == null) return ''
  const lower = s.trim().toLowerCase()
  return (
      lower === 'button'      ? 'bu'
    : lower === 'big blind'   ? 'bb'
    : lower === 'small blind' ? 'sb'
    : 'unknown'
  )
}

proto._readInfo = function _readInfo(line, lineno) {
  line = priceFreeroll(line)
  const gameType   = this._gameType()
  const handInfo   = this._handInfoRx(gameType)
  const handInfoRx = handInfo.rx
  const idxs       = handInfo.idxs
  const match      = line.match(handInfoRx)
  if (match == null) return

  const info = this.hand.info = {}
  if (idxs.room != null)      info.room      = safeLower(match[idxs.room])
  if (idxs.handid != null)    info.handid    = match[idxs.handid]
  if (idxs.currency != null)  info.currency  = match[idxs.currency]
  if (idxs.pokertype != null) info.pokertype = this._identifyPokerType(match[idxs.pokertype])
  if (idxs.limit != null)     info.limit     = this._identifyLimit(match[idxs.limit])
  if (idxs.sb != null)        info.sb        = safeParseFloat(match[idxs.sb])
  if (idxs.bb != null)        info.bb        = safeParseFloat(match[idxs.bb])
  if (idxs.year != null)      info.year      = safeParseInt(match[idxs.year])
  if (idxs.month != null)     info.month     = safeParseInt(match[idxs.month])
  if (idxs.day != null)       info.day       = safeParseInt(match[idxs.day])
  if (idxs.hour != null)      info.hour      = safeParseInt(match[idxs.hour])
  if (idxs.min != null)       info.min       = safeParseInt(match[idxs.min])
  if (idxs.sec != null)       info.sec       = safeParseInt(match[idxs.sec])
  if (idxs.timezone != null)  info.timezone  = safeUpper(match[idxs.timezone])
  if (idxs.gameno != null)    info.gameno    = match[idxs.gameno]
  if (idxs.level != null)     info.level     = safeTrim(safeLower(match[idxs.level]))

  info.gametype = gameType
  info.metadata = { lineno: lineno, raw: line }

  if (idxs.donation != null && idxs.rake != null) {
    const donation = safeParseFloat(match[idxs.donation])
    const rake     = safeParseFloat(match[idxs.rake])

    info.donation  = safeParseFloat(donation)
    info.rake      = safeParseFloat(rake)
    info.buyin     = donation + rake
  }

  if (idxs.tableno != null) {
    const tableno  = gameType === 'tournament'
      ? safeParseInt(match[idxs.tableno])
      : match[idxs.tableno]
    this.hand.table = { tableno: tableno }
  }

  return true
}

proto._readTable = function _readTable(line, lineno) {
  const gameType = this._gameType()
  const table    = this._tableRx(gameType)
  if (table == null) return

  const tableRx  = table.rx
  const idxs     = table.idxs
  const match    = line.match(tableRx)
  if (!match) return

  // in some cases the table info starts getting collected as part of _readInfo
  if (this.hand.table == null) this.hand.table = {}

  const info = this.hand.table
  if (idxs.tableno != null) {
    const tableno  = gameType === 'tournament'
      ? safeParseInt(match[idxs.tableno])
      : match[idxs.tableno]

    info.tableno = tableno
  }
  if (idxs.maxseats != null) info.maxseats = safeParseInt(match[idxs.maxseats])
  if (idxs.button != null)   info.button = safeParseInt(match[idxs.button])
  info.metadata = { lineno: lineno, raw: line }

  return true
}

proto._readSeat = function _readSeat(line, lineno) {
  const match = line.match(this._seatInfoRx)
  if (!match) return

  this.hand.seats.push({
      seatno: safeParseInt(match[1])
    , player: safeTrim(match[2])
    , chips: safeParseFloat(match[3])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })
  return true
}

proto._postType = function _postType(s) {
  const lower = s.toLowerCase()
  return (lower === 'ante' || lower === 'ante chip')  ? 'ante'
        : lower === 'big blind'                       ? 'bb'
        : lower === 'small blind'                     ? 'sb'
        : 'unknown'
}

proto._readPost = function _readPost(line, lineno) {
  const match = line.match(this._postRx)
  if (!match) return

  const type   = this._postType(match[2])
  const amount = safeParseFloat(match[3])

  this.hand.posts.push({
      player: safeTrim(match[1])
    , type: type
    , amount: amount
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })
  if (type === 'ante' && !this.hand.info.ante) this.hand.info.ante = amount
  return true
}

proto._setHeroHoleCards = function _setHeroHoleCards(player, card1, card2, line, lineno) {
  this.hand.hero = safeTrim(player)
  this.hand.holecards = {
      card1: safeFirstUpper(safeTrim(card1))
    , card2: safeFirstUpper(safeTrim(card2))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  return {
      card1: this.hand.holecards.card1
    , card2: this.hand.holecards.card2
  }
}

proto._readHoleCards = function _readHoleCards(line, lineno) {
  const match = line.match(this._holecardsRx)
  if (!match) return
  this._setHeroHoleCards(match[1], match[2], match[3], line, lineno)
  return true
}

// only applies to Ignition which reveals all player's cards
proto._readRevealedCards = function _readRevealedCards(line, lineno) {
  const match = line.match(this._revealRx)
  if (!match) return

  const player = safeTrim(match[1])
  var cards
  if (/\[ME]$/.test(player)) {
    cards = this._setHeroHoleCards(player, match[2], match[3], line, lineno)
  } else {
    const action = showAction(match, 'reveal', line, lineno)
    cards = { card1: action.card1, card2: action.card2 }
    this.hand.showdown.push(action)
  }
  // Use this later to fill in showdown shows
  this._revealedCards[player] = cards

  return true
}

proto._readStreet = function _readStreet(line, lineno) {
  const match = line.match(this._streetIndicatorRx)
  if (!match) return

  this.hand.board = {
      card1: safeFirstUpper(safeTrim(match[2]))
    , card2: safeFirstUpper(safeTrim(match[3]))
    , card3: safeFirstUpper(safeTrim(match[4]))
    , card4: safeFirstUpper(safeTrim(match[5]))
    , card5: safeFirstUpper(safeTrim(match[6]))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  if (match[1] === 'FLOP') this._sawFlop = true
  if (match[1] === 'TURN') {
    this._sawTurn = true
    this.hand.board.card4 = this.hand.board.card5
    this.hand.board.card5 = undefined
  }
  if (match[1] === 'RIVER') this._sawRiver = true
  return true
}

function showAction(match, type, line, lineno) {
  const action = {
      player  : safeTrim(match[1])
    , type    : type
    , card1   : safeFirstUpper(safeTrim(match[2]))
    , card2   : safeFirstUpper(safeTrim(match[3]))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  if (match[4] != null) action.desc = match[4]
  return action
}

//
// Showdown
//
proto._readShowdownShow =  function _readShowdownShow(line, lineno) {
  const match = line.match(this._showRx)
  if (!match) return

  const action = showAction(match, 'show', line, lineno)
  this.hand.showdown.push(action)

  return true
}

proto._readShowdownMuck = function _readShowdownMuck(line, lineno) {
  const match = line.match(this._muckRx)
  if (!match) return

  const action = {
      player  : safeTrim(match[1])
    , type    : 'muck'
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  // Ignition provides us cards and a description
  if (match[2] != null && match[3] != null) {
    action.card1 = safeFirstUpper(safeTrim(match[2]))
    action.card2 = safeFirstUpper(safeTrim(match[3]))
  }
  if (match[4] != null) action.desc = safeTrim(safeLower(match[4]))

  this.hand.showdown.push(action)

  return true
}

proto._readShowdownFinish =  function _readShowdownFinish(line, lineno) {
  const match = line.match(this._finishRx)
  if (!match) return

  const action = {
      player  : safeTrim(match[1])
    , type    : 'finish'
    , place   : safeParseInt(match[2]) || null
    , amount  : safeParseFloat(match[3]) || null
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  this.hand.showdown.push(action)

  return true
}

proto._readShowdown =  function _readShowdown(line, lineno) {
  if (this._readShowdownShow(line, lineno)) return true
  if (this._readShowdownMuck(line, lineno)) return true
  if (this._readShowdownFinish(line, lineno)) return true
  if (this._readCollect(line, lineno)) return true
  return false
}

//
// Summary
//
proto._readSummarySinglePot = function _readSummarySinglePot(line, lineno) {
  var idx = 1
  const match = line.match(this._summarySinglePotRx)
  if (!match) return false

  const amount = safeParseFloat(match[idx++])
  const action = {
      type: 'pot'
    , single: true
    , amount: amount
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  if (match[idx] != null) action.rake = safeParseFloat(match[idx++])

  this.hand.summary.push(action)

  return true
}

proto._readSummarySplitPot = function _readSummarySplitPot(line, lineno) {
  if (this._summarySplitPotRx == null) return false
  var idx = 1
  const match = line.match(this._summarySplitPotRx)
  if (!match) return false

  const amount = safeParseFloat(match[idx++])
  const main   = safeParseFloat(match[idx++])
  const side   = safeParseFloat(match[idx++])
  const action = {
      type: 'pot'
    , single: false
    , amount: amount
    , main: main
    , side: side
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }

  if (match[idx] != null) action.rake = safeParseFloat(match[idx++])

  this.hand.summary.push(action)
  return true
}

proto._readSummaryBoard = function _readBoard(line, lineno) {
  const match = line.match(this._summaryBoardRx)
  if (!match) return

  this.hand.board = {
      card1: safeFirstUpper(safeTrim(match[1]))
    , card2: safeFirstUpper(safeTrim(match[2]))
    , card3: safeFirstUpper(safeTrim(match[3]))
    , card4: safeFirstUpper(safeTrim(match[4]))
    , card5: safeFirstUpper(safeTrim(match[5]))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
}

proto._readSummaryMucked = function _readSummaryMucked(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryMuckedRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const position = this._summaryIncludesPosition
    ? this._identifySummaryPosition(match[idx++])
    : this._positionFrom(player, seatno)
  const card1  = safeFirstUpper(safeTrim(match[idx++]))
  const card2  = safeFirstUpper(safeTrim(match[idx++]))

  this.hand.summary.push({
      type: 'muck'
    , seatno: seatno
    , player: player
    , position: position
    , card1: card1
    , card2: card2
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

proto._readSummaryShowedWon = function _readSummaryShowedWon(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryShowedWonRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const position = this._summaryIncludesPosition
    ? this._identifySummaryPosition(match[idx++])
    : this._positionFrom(player, seatno)
  const card1  = safeFirstUpper(safeTrim(match[idx++]))
  const card2  = safeFirstUpper(safeTrim(match[idx++]))
  const amount = safeParseFloat(match[idx++])
  const description = safeTrim(match[idx++])

  this.hand.summary.push({
      type: 'showed'
    , won: true
    , seatno: seatno
    , player: player
    , position: position
    , card1: card1
    , card2: card2
    , amount: amount
    , description: description
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

proto._readSummaryShowedLost = function _readSummaryShowedLost(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryShowedLostRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const position = this._summaryIncludesPosition
    ? this._identifySummaryPosition(match[idx++])
    : this._positionFrom(player, seatno)
  const card1  = safeFirstUpper(safeTrim(match[idx++]))
  const card2  = safeFirstUpper(safeTrim(match[idx++]))
  const description = safeTrim(match[idx++])

  this.hand.summary.push({
      type: 'showed'
    , won: false
    , seatno: seatno
    , player: player
    , position: position
    , card1: card1
    , card2: card2
    , description: description
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

proto._readSummaryFolded = function _readSummaryFolded(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryFoldedRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const position = this._summaryIncludesPosition
    ? this._identifySummaryPosition(match[idx++])
    : this._positionFrom(player, seatno)

  const streetIndicator = safeLower(safeTrim(match[idx++]))
  const street = (
      streetIndicator === 'before flop' ? 'preflop'
    : streetIndicator === 'before the flop' ? 'preflop'
    : streetIndicator === 'on the flop' ? 'flop'
    : streetIndicator === 'on the turn' ? 'turn'
    : streetIndicator === 'on the river' ? 'river'
    : 'unknown'
  )
  const bet = match[idx++] == null

  this.hand.summary.push({
      type: 'folded'
    , seatno: seatno
    , player: player
    , position: position
    , street: street
    , bet: bet
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

proto._readSummaryCollected = function _readSummaryCollected(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryCollectedRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const position = this._summaryIncludesPosition
    ? this._identifySummaryPosition(match[idx++])
    : this._positionFrom(player, seatno)
  const amount = safeParseFloat(match[idx++])

  this.hand.summary.push({
      type: 'collected'
    , seatno: seatno
    , player: player
    , position: position
    , amount: amount
   , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

// All info in summary is already encoded in the hand, but we parse it out anyways in order to
// provide all the info we need to write the entire hand history from this info, i.e. when
// converting from one site format to another.
proto._readSummary =  function _readSummary(line, lineno) {
  if (this._readSummarySinglePot(line, lineno)) return true
  if (this._readSummarySplitPot(line, lineno)) return true
  if (this._readSummaryBoard(line, lineno)) return true
  if (this._readSummaryMucked(line, lineno)) return true
  // Lost cases will also match the won regex, so this order is important
  if (this._readSummaryShowedLost(line, lineno)) return true
  if (this._readSummaryShowedWon(line, lineno)) return true
  if (this._readSummaryFolded(line, lineno)) return true
  if (this._readSummaryCollected(line, lineno)) return true
  return false
}

function actionType(s) {
  s = s.replace(/(ed|s)$/, '').toLowerCase()
  // convert 'fold(timeout)' to 'fold' (Ignition)
  if (/^fold/.test(s)) return 'fold'
  // convert  'All-in(raise)' to 'raise' (Ignition)
  if (/all-in\(raise\)/.test(s)) return 'raise'
  if (/all-in\(bet\)/.test(s)) return 'bet'
  if (/all-in/.test(s)) return 'call'
  return s
}

proto._readAction = function _readAction(line, lineno) {
  if (this._readBetReturned(line, lineno)) return true

  const match = line.match(this._actionRx)
  if (!match) return false

  const type = actionType(match[2])
  const action = {
      player  : safeTrim(match[1])
    , type    : type
    , amount  : safeParseFloat(match[3])
  }
  if (type === 'raise') {
    action.raiseTo = safeParseFloat(match[4])
    action.allin = !!match[5] || /all-in/i.test(match[2])
  } else if (type === 'call' || type === 'bet') {
    action.allin = !!match[5] || /all-in/i.test(match[2])
  }

  action.metadata = {
      lineno: lineno
    , raw: line
  }

  this._addAction(action, line, lineno)
  return true
}

proto._readCollect = function _readCollect(line, lineno) {
  const match = line.match(this._collectRx)
  if (!match) return false

  const action = {
      player  : safeTrim(match[1])
    , type    : 'collect'
    , amount  : safeParseFloat(match[2])
    , pot     : safeTrim(match[3]) || null
  }
  this._addAction(action, line, lineno)
  return true
}

proto._readBetReturned = function _readBetReturned(line, lineno) {
  const match = line.match(this._betReturnedRx)
  if (!match) return false

  const action = {
      player  : safeTrim(match[2])
    , type    : 'bet-returned'
    , amount  : safeParseFloat(match[1])
  }

  this._addAction(action, line, lineno)
  return true
}

proto._addAction = function _addAction(action, line, lineno) {
  action.metadata = {
      lineno: lineno
    , raw: line
  }
  if (this._sawShowdown) {
    this.hand.showdown.push(action)
  } else if (this._sawRiver) {
    this.hand.river.push(action)
  } else if (this._sawTurn) {
    this.hand.turn.push(action)
  } else if (this._sawFlop) {
    this.hand.flop.push(action)
  } else {
    this.hand.preflop.push(action)
  }
}

proto.parse = function parse() {
  this._cachedGameType = null
  const lines = this._lines
  for (var i = 0; i < lines.length; i++) {
    // Summary
    if (this._sawSummary) {
      if (this._readSummary(lines[i], i)) continue
    } else {
      this._sawSummary = this._summaryIndicator(lines[i], i)
      if (this._sawSummary) continue
    }

    // Showdown
    if (this._sawShowdown) {
      if (this._readShowdown(lines[i], i)) continue
    } else {
      this._sawShowdown = this._showdownIndicator(lines[i], i)
      if (this._sawShowdown) {
        if (this._noseparateShowdownLine) i--
        continue
      }
    }

    // Preflop
    if (this._sawPreflop) {
      if (!this._sawFlop && !this.hand.holecards) {
        if (this._revealRx == null) {
          if (this._readHoleCards(lines[i], i)) {
            this._sawPreflop = true
            continue
          }
        } else {
          // only applies to Ignition for now
          if (this._revealRx != null) {
            if (this._readRevealedCards(lines[i], i)) {
              i++
              while (this._readRevealedCards(lines[i], i)) i++
              i--
            }
            this._sawPreflop = true
            continue
          }
        }
      }
      // Flop, Turn, River
      if (this._readStreet(lines[i], i)) continue
      if (this._readAction(lines[i], i)) continue
      if (this._readCollect(lines[i], i)) continue
    } else {
      this._sawPreflop = this._preflopIndicator(lines[i], i)
      if (this._sawPreflop) continue

      if (this._readPost(lines[i], i)) {
        this._posted = true
        continue
      }
    }

    if (!this._posted) {
      if (this.hand.info == null) {
        if (this._readInfo(lines[i], i)) {
          // in some cases (right now only for tests) we are only interested
          // in the tournament or cash game info (i.e. the first line)
          if (this._infoOnly) return this.hand.info
          continue
        }
      }
      if (!this.hand.table)  if (this._readTable(lines[i], i)) continue
      if (this._readSeat(lines[i], i)) continue
    }
  }
  return this.hand
}

proto.canParse = function canParse() {
  return this._gameType() != null
}

module.exports = HandHistoryParser

},{"../util/string":11,"../util/tweaks":12}],9:[function(require,module,exports){
'use strict'

const stringUtil     = require('../util/string')
const safeParseInt   = stringUtil.safeParseInt
const safeParseFloat = stringUtil.safeParseFloat
const safeTrim       = stringUtil.safeTrim
const safeLower      = stringUtil.safeLower
const safeFirstUpper = stringUtil.safeFirstUpper

const hero = 'IgnitionHero'
const prefix = 'Ignition-'

// Tournament
// Ignition Hand #3548320887: HOLDEM Tournament #18509313 TBL#1,
// Normal- Level 1 (10/20) - 2017-07-21 13:48:15

// Cash Zone Poker
// Ignition Hand #3372762461  Zone Poker ID#875 HOLDEMZonePoker No Limit - 2016-10-16 13:55:35
// It appears that Bovada has an identical history format
const roomGameID =
  // Ignition Hand #3548320887:
  '^(Ignition|Bovada) (?:Hand|Game) #(\\d+):? +'

const pokerType =
  // HOLDEM
  '(HOLDEM) +'

const cashTableID =
  'Zone Poker ID#([^ ]+) '

const cashPokerTypeLimit =
  // HOLDEMZonePoker No Limit
  '(HOLDEM)(?:ZonePoker)? +(No Limit)'

const tournamentID =
  // Tournament #18509313
  'Tournament #(\\d+) +'

const tournamentTable =
  'TBL#(\\d+), +'

const tournamentLevel =
  // Level 1 (10/20)
  '(?:Normal-)? Level ([^(]+)\\(([^/]+)/([^)]+)\\)(?: - ){0,1}'

const date =
  // 2016-03-01
  '[^\\d]*(\\d{4}).(\\d{2}).(\\d{2}) +'

const time =
  // 1:29:41
  '[^\\d]*([^:]+):([^:]+):([^ ]+)(.+)'

const tournamentInfo = new RegExp(
    roomGameID
  + pokerType
  + tournamentID
  + tournamentTable
  + tournamentLevel
  + date
  + time
  + '$'
)

const tournamentInfoIdxs = {
    room      : 1
  , handid    : 2
  , pokertype : 3
  , gameno    : 4
  , tableno   : 5
  , level     : 6
  , sb        : 7
  , bb        : 8
  , year      : 9
  , month     : 10
  , day       : 11
  , hour      : 12
  , min       : 13
  , sec       : 14
  , timezone  : null
  , currency  : null
  , donation  : null
  , rake      : null
  , limit     : null
}

const cashGameInfo = new RegExp(
    roomGameID
  + cashTableID
  + cashPokerTypeLimit
  + date
  + time
  + '$'
)

const cashGameInfoIdxs = {
    room      : 1
  , handid    : 2
  , tableno   : 3
  , pokertype : 4
  , limit     : 5
  , year      : 6
  , month     : 7
  , day       : 8
  , hour      : 9
  , min       : 10
  , sec       : 11
  , timezone  : null
  , currency  : null
  , sb        : null
  , bb        : null
}

const HandHistoryParser = require('./base')

function HoldemIgnitionParser(lines, opts) {
  if (!(this instanceof HoldemIgnitionParser)) return new HoldemIgnitionParser(lines, opts)
  HandHistoryParser.call(this, lines, opts)
}

HoldemIgnitionParser.prototype = Object.create(HandHistoryParser.prototype)
HoldemIgnitionParser.prototype.constructor = HoldemIgnitionParser
const proto = HoldemIgnitionParser.prototype

proto._handInfoRx = function _handInfoRx(gameType) {
  switch (gameType.toLowerCase()) {
    case 'tournament': return { rx: tournamentInfo, idxs: tournamentInfoIdxs }
    case 'cashgame': return { rx: cashGameInfo, idxs: cashGameInfoIdxs }
    default: throw new Error('Unknown game type ' + gameType)
  }
}

proto._tableRx = function _tableRx(gameType) {
  // Ignition doesn't have the extra line describing the table
  // all info is included in the first line.
  return null
}

// Hand Setup
proto._seatInfoRx          = /^Seat (\d+): (.+)\([$|€]?([^ ]+) in chips(?:, .+? bounty)?\)( .+sitting out)?$/i
proto._postRx              = /^([^:]+): (Ante chip|Small blind|Big blind) [$|€]?([^ ]+)$/i // Big Blind : Big blind 20

// Street Indicators
proto._preflopIndicatorRx  = /^\*\*\* HOLE CARDS \*\*\*$/i
proto._streetIndicatorRx   = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*[^[]+\[(..) (..) (..)(?: (..))?](?: \[(..)])?$/i
proto._noseparateShowdownLine = true
proto._summaryIndicatorRx  = /^\*\*\* SUMMARY \*\*\*$/i

// Street actions
proto._holecardsRx         = /^([^:]+) : Card dealt to a spot \[(..) (..)]$/i
proto._actionRx            = /^([^:]+) : (raises|All-in\(raise\)|bets|All-in\(bet\)|call|All-in|checks|folds(?:\(timeout\))?) ?[$|€]?([^ ]+)?(?: to [$|€]?([^ ]+))?(.+all-in)?$/i
proto._collectRx           = /^([^:]+) : Hand Result(?:-Side Pot)? *[$|€]?([^ ]+)$/i
proto._betReturnedRx       = /^([^:]+) : Return uncalled portion of bet [(]?[$|€]?([^ )]+)[)]?$/i

// Showdown (also uses _collectRx and _betReturnedRx)
proto._showRx              = /^([^:]+) : Showdown *(?:\[(?:..)+])? *\(([^)]+)\)$/i
// 'Does not show' seems to show up only when there is no showdown
// Therefore technically it is no muck and since we reveal all cards anyways we ignore that case.
proto._muckRx              = /^([^:]+) : (?:Does not show|Mucks) \[(..) (..)] \(([^)]+)\)$/i
// Below substitute for _finishRx
proto._finishPlaceRx       = /^([^:]+) : Ranking (\d+)$/i
proto._finishAmountRx      = /^([^:]+) : Prize Cash \[([$|€])([^\]]+)]$/i

// Summary
// Ignition only shows total pot here and never rake.
// The info about whether the pot was split and/or if there was a side pot is only
// encoded in the collect (Hand Result). For now we just create two collections for
// same opponent in case he collects side pot + main pot.
// We ignore the info in the summary until it is proven that we really need to provide
// it for specific tools to work properly.
proto._summarySinglePotRx  = /^Total Pot\(([$|€])?([^ ]+)\)$/i
proto._summarySplitPotRx   = null
proto._summaryBoardRx      = /^Board \[(..)?( ..)?( ..)?( ..)?( ..)? *]$/i
proto._summaryMuckedRx     = /^Seat\+([^:]+): (.+?) \[Mucked] \[(..) (..) +]$/i
proto._summaryCollectedRx  = /^Seat\+([^:]+): (.+?) [$|€]?([^ ]+) +\[Does not show]$/i
proto._summaryShowedWonRx  = /^Seat\+([^:]+): (.+?) [$|€]?([^ ]+) +with ([^[]+) \[(..) (..).*]$/i
proto._summaryShowedLostRx = /^Seat\+([^:]+): (.+?) (?:lose|lost) +with ([^[]+) \[(..) (..).*]$/i
proto._summaryFoldedRx     = /^Seat\+([^:]+): (.+?) Folded (before (?:the )?Flop|on the Flop|on the Turn|on the River)$/i

proto._revealRx            = /^([^:]+) : Card dealt to a spot \[(..) (..)]$/i

// @override
// implemented in base but order of matches reversed from default
proto._readBetReturned = function _readBetReturned(line, lineno) {
  const match = line.match(this._betReturnedRx)
  if (!match) return false

  const action = {
      player  : match[1]
    , type    : 'bet-returned'
    , amount  : safeParseFloat(match[2])
  }

  this._addAction(action, line, lineno)
  return true
}

//
// Showdown
//

// @override
proto._showdownIndicator = function _showdownIndicator(line, lineno) {
  return this._showRx.test(line)
}

proto._readShowdownFinishPlace =  function _readShowdownFinishPlace(line, lineno) {
  const match = line.match(this._finishPlaceRx)
  if (!match) return

  const action = {
      player  : safeTrim(match[1])
    , type    : 'finish'
    , place   : safeParseInt(match[2]) || null
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  this.hand.showdown.push(action)
  // hold on to this so we can add the prize (amount) won which is given on next line
  this._lastFinish = action

  return true
}

proto._readShowdownFinishAmount =  function _readShowdownFinishAmount(line, lineno) {
  const match = line.match(this._finishAmountRx)
  if (!match) return

  const player = safeTrim(match[1])

  // matched but no idea where it belongs
  if (this._lastFinish.player !== player) return true

  // Ignition doesn't give us the currency in the head, so we fill it in when we
  // can, like here
  if (this.hand.info != null && this.hand.info.currency == null) {
    this.hand.info.currency = safeTrim(match[2])
  }
  this._lastFinish.amount = safeParseFloat(match[3])
  this._lastFinish.metadata.raw = this._lastFinish.metadata.raw + '\n' + line

  return true
}

// @override
proto._readShowdownShow =  function _readShowdownShow(line, lineno) {
  const match = line.match(this._showRx)
  if (!match) return

  // Cards aren't known here since Ignition shows full board used for best hand
  // However since all cards are revealed we can fill those in after we read the
  // whole hand.
  const action = {
      player  : safeTrim(match[1])
    , type    : 'show'
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  if (match[2] != null) action.desc = safeTrim(safeLower(match[2]))
  this.hand.showdown.push(action)

  return true
}

proto._positionFrom = function _positionFrom(player, seatno) {
  if (player == null) return ''
  const lower = player.toLowerCase()
  return (
      lower === 'dealer'      ? 'bu'
    : lower === 'small blind' ? 'sb'
    : lower === 'big blind'   ? 'bb'
    : ''
  )
}

// @override
proto._readShowdown = function _readShowdown(line, lineno) {
  if (this._readShowdownShow(line, lineno)) return true
  if (this._readShowdownMuck(line, lineno)) return true
  if (this._readShowdownFinishPlace(line, lineno)) return true
  if (this._readShowdownFinishAmount(line, lineno)) return true
  if (this._readCollect(line, lineno)) return true
  return false
}

//
// Summary
//

// @override
proto._readSummarySinglePot = function _readSummarySinglePot(line, lineno) {
  // overridden to capture cashcame currency in one place
  var idx = 1
  const match = line.match(this._summarySinglePotRx)
  if (!match) return false

  const currency = safeTrim(match[idx++])
  const amount = safeParseFloat(match[idx++])
  const action = {
      type: 'pot'
    , single: true
    , amount: amount
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  this.hand.summary.push(action)

  if (this.hand.info != null &&
      this.hand.info.currency == null &&
      currency != null) {
    this.hand.info.currency = currency
  }
  return true
}

// @override
proto._readSummaryShowedLost = function _readSummaryShowedLost(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryShowedLostRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const description = safeTrim(match[idx++])
  const card1  = safeFirstUpper(safeTrim(match[idx++]))
  const card2  = safeFirstUpper(safeTrim(match[idx++]))

  const position = this._positionFrom(player, seatno)

  this.hand.summary.push({
      type: 'showed'
    , won: false
    , seatno: seatno
    , player: player
    , position: position
    , card1: card1
    , card2: card2
    , description: description
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

// @override
proto._readSummaryShowedWon = function _readSummaryShowedWon(line, lineno) {
  var idx = 1
  const match = line.match(this._summaryShowedWonRx)
  if (!match) return false

  const seatno = safeParseInt(match[idx++])
  const player = safeTrim(match[idx++])
  const amount = safeParseFloat(match[idx++])
  const description = safeTrim(match[idx++])
  const card1  = safeFirstUpper(safeTrim(match[idx++]))
  const card2  = safeFirstUpper(safeTrim(match[idx++]))

  const position = this._positionFrom(player, seatno)

  this.hand.summary.push({
      type: 'showed'
    , won: true
    , seatno: seatno
    , player: player
    , position: position
    , card1: card1
    , card2: card2
    , amount: amount
    , description: description
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })

  return true
}

proto._gameType = function _gameType() {
  if (this._cachedGameType) return this._cachedGameType
  const lines = this._lines
  for (var i = 0; i < lines.length && lines[i].length; i++) {
    if (tournamentInfo.test(lines[i])) {
      this._cachedGameType = 'tournament'
      return this._cachedGameType
    }
    if (cashGameInfo.test(lines[i])) {
      this._cachedGameType = 'cashgame'
      return this._cachedGameType
    }
  }
  return null
}

function correctHeroPlayer(x) {
  const currentHero = this.currentHero
  const currentHeroNoMe = this.currentHeroNoMe
  if (x.player === currentHero) x.player = hero
  if (x.player === currentHeroNoMe) x.player = hero
}

function correctHeroName(hand) {
  // We don't condense this with the other player name adjustment
  // as getting a consistent name for hero first is makes things easier.
  const currentHero = hand.hero
  const ctx = {
      currentHero: currentHero
      // In summary the '[ME]' portion is dropped :(
    , currentHeroNoMe: currentHero.replace(/ +\[ME] *$/, '')
  }

  hand.seats.forEach(correctHeroPlayer, ctx)
  hand.posts.forEach(correctHeroPlayer, ctx)
  hand.preflop.forEach(correctHeroPlayer, ctx)
  hand.flop.forEach(correctHeroPlayer, ctx)
  hand.turn.forEach(correctHeroPlayer, ctx)
  hand.river.forEach(correctHeroPlayer, ctx)
  hand.showdown.forEach(correctHeroPlayer, ctx)
  hand.summary.forEach(correctHeroPlayer, ctx)
  hand.hero = hero
  return hand
}

function deduceAnte(hand) {
  if (!hand.info) return
  if (hand.info.ante != null) return
  if (hand.posts == null || hand.posts.length === 0) return

  for (var i = 0; i < hand.posts.length; i++) {
    const post = hand.posts[i]
    if (post.type === 'ante') {
      hand.info.ante = post.amount
      return
    }
  }
}

function deduceBlinds(hand) {
  // Cash (at least zone) games don't include blinds in header
  if (!hand.info) return
  if (hand.info.bb != null && hand.info.sb != null) return
  if (hand.posts == null || hand.posts.length === 0) return

  for (var i = 0; i < hand.posts.length; i++) {
    const post = hand.posts[i]
    if (post.type === 'bb' && hand.info.bb == null) {
      hand.info.bb = post.amount
      if (hand.info.sb != null) return
    } else if (post.type === 'sb' && hand.info.sb == null) {
      hand.info.sb = post.amount
      if (hand.info.bb != null) return
    }
  }
}

function deduceTableInfo(hand) {
  // just a wild guess .. something is seriously wrong anyways ;)
  if (hand.seats.length === 0) {
    hand.table.maxseats = 2
    hand.table.button = 1
    return
  }

  var button = 1
  const len = hand.seats.length
  for (var i = 0; i < len; i++) {
    const seat = hand.seats[i]
    if (seat.player === 'Dealer') {
      seat.isbutton = true
      button = seat.seatno
      break
    }
  }

  // best guess we can do, will be inaccurate in lots of cases
  const maxseats = (
      len > 6 ? 9
    : len > 2 ? 6
    : 2
  )
  hand.table.maxseats = maxseats
  hand.table.button = button
}

function fillShowdownHands(hand, revealed) {
  if (hand.showdown == null || hand.showdown.length === 0) return
  hand.showdown.forEach(fill)
  function fill(x) {
    if (x.type !== 'show' || x.card1 != null) return
    const cards = revealed[x.player]
    if (cards == null) return
    x.card1 = cards.card1
    x.card2 = cards.card2
  }
}

function adjustPlayerAndSeat(x) {
  const map = this.map
  const entry = map[x.player]
  if (entry == null) return

  x.player = entry.player
  x.seatno = entry.seatno
}

function improvePlayerNamesAndSeatNumbers(hand) {
  // seatnos are actually IDs assigned to a player which he keeps thru the lifetime
  // of the tourney even if moved to another table. So we'll use that as the name (except
  // for the hero).
  // Actual seatnos are tougher to deduce. In a single table SNG they correspond to the
  // player name, but in MTTs they don't.
  // Here we just need to make a decision as to who is seat 1 and calculate the others
  // from the order in which they are listed (hand.seats)
  // Best is to make hero seat 1 since we know that he will always be there throughout
  // multiple hands and therefore the seats will not change.

  // First we build the map by current player name
  const beforeHero = []
  var i = 0
  var seatno = 1
  const map = {}
  for (; i < hand.seats.length; i++) {
    const seat = hand.seats[i]
    if (seat.player === hero) {
      map[hero] = { player: hero, seatno: seatno++ }
      break
    }
    beforeHero.push(seat)
  }
  if (i === hand.seats.length) return // something is seriously wrong (couldn't find hero)

  // seats mentioned after hero
  for (i = i + 1; i < hand.seats.length; i++) {
    const seat = hand.seats[i]
    map[seat.player] = { player: prefix + seat.seatno, seatno: seatno++ }
  }
  // seats mentioned before hero
  for (var j = 0; j < beforeHero.length; j++) {
    const seat = beforeHero[j]
    map[seat.player] = { player: prefix + seat.seatno, seatno: seatno++ }
  }

  // Now we need to fix all player names throughout the hand
  const ctx = { map }
  hand.seats.forEach(adjustPlayerAndSeat, ctx)
  hand.posts.forEach(adjustPlayerAndSeat, ctx)
  hand.preflop.forEach(adjustPlayerAndSeat, ctx)
  hand.flop.forEach(adjustPlayerAndSeat, ctx)
  hand.turn.forEach(adjustPlayerAndSeat, ctx)
  hand.river.forEach(adjustPlayerAndSeat, ctx)
  hand.showdown.forEach(adjustPlayerAndSeat, ctx)
  hand.summary.forEach(adjustPlayerAndSeat, ctx)

  // Finally fix the button
  for (var k = 0; k < hand.seats.length; k++) {
    const seat = hand.seats[k]
    if (seat.isbutton) hand.table.button = seat.seatno
  }
}

exports.canParse = function canParse(lines) {
  return new HoldemIgnitionParser(lines).canParse()
}

function fixMe(x) {
  return x.replace('  [ME] :', ' [ME] :')
}

function buyInFromFileName(hand, file) {
  if (file == null) return
  const rx = /[$|€](?:([\d.,]+)-[$|€]([\d.,]+))/

  const match = file.match(rx)
  if (!match || match[1] == null || match[2] == null) return

  const donation = safeParseFloat(match[1])
  const rake = safeParseFloat(match[2])

  hand.info.donation = donation
  hand.info.rake = rake
  hand.info.buyin = donation + rake
}

exports.parse = function parse(lines, opts) {
  // Fix the inconsistency in hero indication in player names between cash cames and tourneys
  lines = lines.map(fixMe)

  const parser = new HoldemIgnitionParser(lines, opts)
  const hand = parser.parse()
  deduceAnte(hand)
  deduceBlinds(hand)
  deduceTableInfo(hand)
  fillShowdownHands(hand, parser._revealedCards)
  correctHeroName(hand)
  improvePlayerNamesAndSeatNumbers(hand)
  buyInFromFileName(hand, opts && opts.buyinFile)
  return hand
}

exports.create = function create(lines, infoOnly) {
  return new HoldemIgnitionParser(lines, infoOnly)
}


},{"../util/string":11,"./base":8}],10:[function(require,module,exports){
'use strict'

const priceFreeroll  = require('../util/tweaks').priceFreeroll

const roomGameID =
  // PokerStars Hand #149651992548:
  // PokerStars Zoom Hand #164181769033:
  '^(PokerStars) (?:Zoom )?(?:Hand|Game) #(\\d+): +'

const tournamentID =
  // Tournament #1495192630,
  'Tournament #(\\d+), '

const tournamentBuyIn =
  // $0.91+$0.09
  '([$|€])((?:[\\d]+\\.\\d+)|(?:[\\d]+))\\+([$|€])((?:[\\d]+\\.\\d+)|(?:[\\d]+)).+'

const cashGameBlinds =
  // ($0.02/$0.05)
  '\\(([$|€])([^/]+)\\/[$|€]([^)]+)\\)'

const pokerType =
  // USD Hold'em No Limit -
  '(Hold\'em) +(No Limit) -? *'

const tournamentLevel =
  // Level XI (400/800)
  'Level ([^(]+)\\(([^/]+)/([^)]+)\\)(?: - ){0,1}'

const date =
  // 2016/03/01
  '[^\\d]*(\\d{4}).(\\d{2}).(\\d{2})'

const time =
  // 1:29:41 ET
  // 23:37:43 CET [2018/03/09 17:37:43 ET]
  '[^\\d]*([^:]+):([^:]+):([^\\s]+) ([^\\s]*).*'

const tournamentInfo = new RegExp(
    roomGameID
  + tournamentID
  + tournamentBuyIn
  + pokerType
  + tournamentLevel
  + date
  + time
  + '$'
)
const tournamentInfoIdxs = {
    room      : 1
  , handid    : 2
  , gameno    : 3
  , currency  : 4
  , donation  : 5
  , rake      : 7
  , pokertype : 8
  , limit     : 9
  , level     : 10
  , sb        : 11
  , bb        : 12
  , year      : 13
  , month     : 14
  , day       : 15
  , hour      : 16
  , min       : 17
  , sec       : 18
  , timezone  : 19
}

const cashGameInfo = new RegExp(
    roomGameID
  + pokerType
  + cashGameBlinds
  + '[ -]*'
  + date
  + time
  + '$'
)

const cashGameInfoIdxs = {
    room      : 1
  , handid    : 2
  , pokertype : 3
  , limit     : 4
  , currency  : 5
  , sb        : 6
  , bb        : 7
  , year      : 8
  , month     : 9
  , day       : 10
  , hour      : 11
  , min       : 12
  , sec       : 13
  , timezone  : 14
}

const tournamentTable =
  /^Table '\d+ (\d+)' (\d+)-max Seat #(\d+) is.+button$/i

const tournamentTableIdxs = {
    tableno  : 1
  , maxseats : 2
  , button   : 3
}

const cashGameTable =
  /^Table '([^']+)' (\d+)-max Seat #(\d+) is.+button$/i

const cashGameTableIdxs = {
    tableno  : 1
  , maxseats : 2
  , button   : 3
}

const HandHistoryParser = require('./base')

function HoldemPokerStarsParser(lines, opts) {
  if (!(this instanceof HoldemPokerStarsParser)) return new HoldemPokerStarsParser(lines, opts)
  HandHistoryParser.call(this, lines, opts)
}

HoldemPokerStarsParser.prototype = Object.create(HandHistoryParser.prototype)
HoldemPokerStarsParser.prototype.constructor = HoldemPokerStarsParser
const proto = HoldemPokerStarsParser.prototype

proto._handInfoRx = function _handInfoRx(gameType) {
  switch (gameType.toLowerCase()) {
    case 'tournament': return { rx: tournamentInfo, idxs: tournamentInfoIdxs }
    case 'cashgame': return { rx: cashGameInfo, idxs: cashGameInfoIdxs }
    default: throw new Error('Unknown game type ' + gameType)
  }
}

proto._tableRx = function _tableRx(gameType) {
  switch (gameType.toLowerCase()) {
    case 'tournament': return { rx: tournamentTable, idxs: tournamentTableIdxs }
    case 'cashgame': return { rx: cashGameTable, idxs: cashGameTableIdxs }
    default: throw new Error('Unknown game type ' + gameType)
  }
}

// Hand Setup
proto._seatInfoRx          = /^Seat (\d+): (.+)\([$|€]?([^ ]+) in chips(?:, .+? bounty)?\)( .+sitting out)?$/i
proto._postRx              = /^([^:]+): posts (?:the )?(ante|small blind|big blind) [$|€]?([^ ]+)$/i

// Street Indicators
proto._preflopIndicatorRx  = /^\*\*\* HOLE CARDS \*\*\*$/i
proto._streetIndicatorRx   = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*[^[]+\[(..) (..) (..)(?: (..))?](?: \[(..)])?$/i
proto._showdownIndicatorRx = /^\*\*\* SHOW DOWN \*\*\*$/i
proto._summaryIndicatorRx  = /^\*\*\* SUMMARY \*\*\*$/i

// Street actions
proto._holecardsRx         = /^Dealt to ([^[]+) \[(..) (..)]$/i
proto._actionRx            = /^([^:]+): (raises|bets|calls|checks|folds) ?[$|€]?([^ ]+)?(?: to [$|€]?([^ ]+))?(.+all-in)?$/i
proto._collectRx           = /^(.+) collected [$|€]?([^ ]+) from (?:(main|side) )?pot$/i
proto._betReturnedRx       = /^uncalled bet [(]?[$|€]?([^ )]+)[)]? returned to (.+)$/i

// Showdown (also uses _collectRx and _betReturnedRx)
proto._showRx              = /^([^:]+): shows \[(..) (..)] \(([^)]+)\)$/i
proto._muckRx              = /^([^:]+): mucks hand$/i
proto._finishRx            = /^(.+?) finished the tournament(?: in (\d+).+ place)?(?: and received [$|€]([^ ]+)\.)?$/i

// Summary
proto._summarySinglePotRx  = /^Total pot [$|€]?([^ ]+) \| Rake [$|€]?([^ ]+)$/i
proto._summarySplitPotRx   = /^Total pot [$|€]?([^ ]+) Main pot [$|€]?([^ ]+)\. Side pot [$|€]?([^ ]+)\. \| Rake [$|€]?([^ ]+)$/i
proto._summaryBoardRx      = /^Board \[(..)?( ..)?( ..)?( ..)?( ..)?]$/i
proto._summaryMuckedRx     = /^Seat (\d+): (.+?) (?:\((button|small blind|big blind)\) )?mucked \[(..) (..)]$/i
proto._summaryCollectedRx  = /^Seat (\d+): (.+?) (?:\((button|small blind|big blind)\) )?collected \([$|€]?([^)]+)\)$/i
proto._summaryShowedWonRx  = /^Seat (\d+): (.+?) (?:\((button|small blind|big blind)\) )?showed \[(..) (..)] and won \([$|€]?([^)]+)\) with (.+)$/i
proto._summaryShowedLostRx = /^Seat (\d+): (.+?) (?:\((button|small blind|big blind)\) )?showed \[(..) (..)] and lost with (.+)$/i
proto._summaryFoldedRx     = /^Seat (\d+): (.+?) (?:\((button|small blind|big blind)\) )?folded (before Flop|on the Flop|on the Turn|on the River)( \(didn't bet\))?$/i
proto._summaryIncludesPosition = true

proto._revealRx            = null

proto._gameType = function _gameType() {
  if (this._cachedGameType) return this._cachedGameType
  const lines = this._lines
  for (var i = 0; i < lines.length && lines[i].length; i++) {
    var line = priceFreeroll(lines[i])
    if (tournamentInfo.test(line)) {
      this._cachedGameType = 'tournament'
      return this._cachedGameType
    }
    if (cashGameInfo.test(line)) {
      this._cachedGameType = 'cashgame'
      return this._cachedGameType
    }
  }
  return null
}

exports.canParse = function canParse(lines) {
  return new HoldemPokerStarsParser(lines).canParse()
}

exports.parse = function parse(lines, infoOnly) {
  return new HoldemPokerStarsParser(lines, infoOnly).parse()
}

exports.create = function create(lines, infoOnly) {
  return new HoldemPokerStarsParser(lines, infoOnly)
}

},{"../util/tweaks":12,"./base":8}],11:[function(require,module,exports){
'use strict'

exports.trimLine = function trimLine(line) { return line.trim() }
exports.emptyLine = function emptyLine(line) { return line.length }
exports.safeLower = function safeLower(s) {
  return typeof s === 'undefined'
    ? undefined
    : s.toLowerCase()
}
exports.safeUpper = function safeUpper(s) {
  return typeof s === 'undefined'
    ? undefined
    : s.toUpperCase()
}
exports.safeFirstUpper = function safeFirstUpper(s) {
  return typeof s === 'undefined' || s.length < 1
    ? s
    : s[0].toUpperCase() + s.slice(1)
}
exports.safeTrim = function safeTrim(s) {
  return typeof s === 'undefined'
    ? undefined
    : s.trim()
}
exports.safeParseInt = function safeParseInt(s) {
  return typeof s === 'undefined'
    ? undefined
    : parseInt(s)
}
exports.safeParseFloat = function safeParseFloat(s) {
  return (
      typeof s === 'undefined' ?  undefined
    : typeof s === 'string' ? parseFloat(s.replace(/,/g, ''))
    : s
  )
}

},{}],12:[function(require,module,exports){
'use strict'

function priceFreeroll(line) {
  // Converting the word 'Freeroll' into a reflective tournament buyin
  // of #0
  // XxX: somewhat hacky but a quick fix for freeroll edge case
  // Proper solution is much more involved since not only is the regex
  // different, but also all indexes change as there is no currency
  // or donation in a freeeroll
  return line.replace(/Freeroll/i, '$0.00+$0.00 USD')
}

exports.priceFreeroll = priceFreeroll

},{}],13:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const hhv = require('../hhv')
const hhp = require('hhp')
const hha = require('hha')

const visualizedHandsEl = document.getElementById('visualized-hands')
const handhistoryEl     = document.getElementById('handhistory-entry')
const filterEl          = document.getElementById('filter')
const loadSampleEl      = document.getElementById('load-sample')
const loadFileEl        = document.getElementById('load-file')

hhv.injectStyle(hhv.css, document, 'hhv-hand-css')

function analyzeHistory (h) {
  const parsed = hhp(h)
  try {
    return hha(parsed)
  } catch (e) {
    console.error(e)
    console.error(h)
    return null
  }
}

const players = {}
const showChips = true
function addPlayer (k) { players[k] = true }
function render (h) {
  const info = hhv.render(h, showChips)
  info.players.forEach(addPlayer)
  return info.html
}

function isnull (x) { return !!x }

function initializeFilter (filterHtml, hero) {
  filterEl.innerHTML = filterHtml

  const playersFilterEl = document.getElementsByClassName('hhv-filter-players')[0]
  const showFilterEl = document.getElementsByClassName('hhv-filter-show')[0]
  const displayFilterEl = document.getElementsByClassName('hhv-filter-display')[0]

  playersFilterEl.addEventListener('change', onplayersChange)
  showFilterEl.addEventListener('change', onshowChange)
  displayFilterEl.addEventListener('change', ondisplayChange)

  const opts = {
      hand: null
    , players: { filter: 'invested' }
  }
  let selectedPlayer = hero
  let playerSelected = false

  function onplayersChange (e) {
    selectedPlayer = e.target.value
    updateSelectPlayer()
  }

  function onshowChange (e) {
    const filter = e.target.value
    if (filter === 'all') {
      opts.hand = null
    } else {
      opts.hand = { filter: filter, who: selectedPlayer }
    }
    updateFilter(opts)
  }

  function ondisplayChange (e) {
    const tgt = e.target
    if (tgt.value === 'selectPlayer') {
      playerSelected = tgt.checked
      return updateSelectPlayer(tgt.checked)
    }
    const showInactive = tgt.checked
    opts.players = showInactive ? null : { filter: 'invested' }
    updateFilter(opts)
  }

  function updateSelectPlayer () {
    if (opts.hand) opts.hand.who = selectedPlayer
    updateFilter()
    hhv.selectPlayer(playerSelected, selectedPlayer)
  }

  function updateFilter () {
    hhv.filterHands(opts)
  }

  updateFilter()
}

function update () {
  const historyTxt = handhistoryEl.value.trim()
  const histories = hhp.extractHands(historyTxt)
  const analyzed = histories.map(analyzeHistory).filter(isnull)
  const sorted = hhv.sortByDateTimeDescending(analyzed)
  const rendered = sorted.map(render).join('')
  const allNames = Object.keys(players)
  const hero = analyzed[0].hero
  const filterHtml = hhv.renderFilter(allNames, hero)

  visualizedHandsEl.innerHTML = rendered + '<div>Total of ' + sorted.length + ' hands.</div>'

  initializeFilter(filterHtml, hero)
}
function oninput () {
  loadFileEl.value = ''
  update()
}
handhistoryEl.addEventListener('input', oninput)

function onloadSample () {
  handhistoryEl.value = require('./sample')
  oninput()
}
loadSampleEl.addEventListener('click', onloadSample)

function onloadedFile (e) {
  if (handhistoryEl.value === e.target.result) return
  handhistoryEl.value = e.target.result
  update()
}

function onloadFile (e) {
  const file = this.files.item(0)
  function refresh () {
    const fileReader = new window.FileReader()
    fileReader.readAsText(file)
    fileReader.onload = onloadedFile
    setTimeout(refresh, 2000)
  }
  refresh()
}

loadFileEl.addEventListener('change', onloadFile)

},{"../hhv":15,"./sample":14,"hha":1,"hhp":7}],14:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

module.exports = [
    '*********** # 1 **************'
  , 'PokerStars Hand #149652067173: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:34:24 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 3: Irisha2 (24264 in chips)'
  , 'Seat 4: DmelloH (26893 in chips)'
  , 'Seat 9: held (16343 in chips)'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 400'
  , 'Irisha2: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kd Jh]'
  , 'DmelloH: folds'
  , 'held: raises 977 to 1777'
  , 'Irisha2: calls 977'
  , '*** FLOP *** [7h Th Js]'
  , 'held: checks'
  , 'Irisha2: bets 3200'
  , 'held: raises 3466 to 6666'
  , 'Irisha2: raises 15771 to 22437 and is all-in'
  , 'held: calls 7850 and is all-in'
  , 'Uncalled bet (7921) returned to Irisha2'
  , '*** TURN *** [7h Th Js] [6d]'
  , '*** RIVER *** [7h Th Js 6d] [9c]'
  , '*** SHOW DOWN ***'
  , 'held: shows [Kd Jh] (a pair of Jacks)'
  , 'Irisha2: shows [8s 9s] (a straight, Seven to Jack)'
  , 'Irisha2 collected 32736 from pot'
  , 'held finished the tournament in 3rd place and received $6.75.'
  , '*** SUMMARY ***'
  , 'Total pot 32736 | Rake 0'
  , 'Board [7h Th Js 6d 9c]'
  , 'Seat 3: Irisha2 (big blind) showed [8s 9s] and won (32736) with a straight, Seven to Jack'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) showed [Kd Jh] and lost with a pair of Jacks'
  , ''
  , ''
  , '*********** # 2 **************'
  , 'PokerStars Hand #149652059422: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:33:54 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (3475 in chips)'
  , 'Seat 3: Irisha2 (24314 in chips)'
  , 'Seat 4: DmelloH (33302 in chips)'
  , 'Seat 9: held (6409 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 400'
  , 'held: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qd Qs]'
  , 'Fischersito: raises 2625 to 3425 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: calls 3025'
  , 'held: raises 2934 to 6359 and is all-in'
  , 'DmelloH: calls 2934'
  , '*** FLOP *** [8h Kd 2s]'
  , '*** TURN *** [8h Kd 2s] [6s]'
  , '*** RIVER *** [8h Kd 2s 6s] [4s]'
  , '*** SHOW DOWN ***'
  , 'DmelloH: shows [7h 7d] (a pair of Sevens)'
  , 'held: shows [Qd Qs] (a pair of Queens)'
  , 'held collected 5868 from side pot'
  , 'Fischersito: shows [2c Ad] (a pair of Deuces)'
  , 'held collected 10475 from main pot'
  , 'Fischersito finished the tournament in 4th place and received $5.11.'
  , '*** SUMMARY ***'
  , 'Total pot 16343 Main pot 10475. Side pot 5868. | Rake 0'
  , 'Board [8h Kd 2s 6s 4s]'
  , 'Seat 1: Fischersito showed [2c Ad] and lost with a pair of Deuces'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) showed [7h 7d] and lost with a pair of Sevens'
  , 'Seat 9: held (big blind) showed [Qd Qs] and won (16343) with a pair of Queens'
  , ''
  , ''
  , '*********** # 3 **************'
  , 'PokerStars Hand #149652054275: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:33:35 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (3525 in chips)'
  , 'Seat 3: Irisha2 (24764 in chips)'
  , 'Seat 4: DmelloH (34152 in chips)'
  , 'Seat 9: held (5059 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 400'
  , 'DmelloH: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ad 9s]'
  , 'held: raises 2533 to 3333'
  , 'Fischersito: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (2533) returned to held'
  , 'held collected 2200 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2200 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded before Flop'
  , 'Seat 9: held collected (2200)'
  , ''
  , ''
  , '*********** # 4 **************'
  , 'PokerStars Hand #149652051096: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:33:23 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (3975 in chips)'
  , 'Seat 3: Irisha2 (24214 in chips)'
  , 'Seat 4: DmelloH (34202 in chips)'
  , 'Seat 9: held (5109 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 400'
  , 'Irisha2: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [8h 2h]'
  , 'DmelloH: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Uncalled bet (400) returned to Irisha2'
  , 'Irisha2 collected 1000 from pot'
  , 'Irisha2: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1000 | Rake 0'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) collected (1000)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 5 **************'
  , 'PokerStars Hand #149652043462: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:32:54 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (4825 in chips)'
  , 'Seat 3: Irisha2 (24264 in chips)'
  , 'Seat 4: DmelloH (34252 in chips)'
  , 'Seat 9: held (4159 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 400'
  , 'Fischersito: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [9c 8s]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: raises 3309 to 4109 and is all-in'
  , 'Fischersito: folds'
  , 'Uncalled bet (3309) returned to held'
  , 'held collected 1800 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1800 | Rake 0'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) collected (1800)'
  , ''
  , ''
  , '*********** # 6 **************'
  , 'PokerStars Hand #149652035440: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:32:23 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (4875 in chips)'
  , 'Seat 3: Irisha2 (24314 in chips)'
  , 'Seat 4: DmelloH (34702 in chips)'
  , 'Seat 9: held (3609 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 400'
  , 'held: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kh 4c]'
  , 'Fischersito: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (400) returned to held'
  , 'held collected 1000 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1000 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 9: held (big blind) collected (1000)'
  , ''
  , ''
  , '*********** # 7 **************'
  , 'PokerStars Hand #149652017195: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:31:14 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (4925 in chips)'
  , 'Seat 3: Irisha2 (24764 in chips)'
  , 'Seat 4: DmelloH (17101 in chips)'
  , 'Seat 9: held (20710 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 400'
  , 'DmelloH: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ad Td]'
  , 'held: raises 1199 to 1999'
  , 'Fischersito: folds'
  , 'Irisha2: folds'
  , 'DmelloH: calls 1199'
  , '*** FLOP *** [Ks 8h 9c]'
  , 'DmelloH: bets 4598'
  , 'held: raises 14063 to 18661 and is all-in'
  , 'DmelloH: calls 10454 and is all-in'
  , 'Uncalled bet (3609) returned to held'
  , '*** TURN *** [Ks 8h 9c] [Jc]'
  , '*** RIVER *** [Ks 8h 9c Jc] [6c]'
  , '*** SHOW DOWN ***'
  , 'DmelloH: shows [Qd Kh] (a pair of Kings)'
  , 'held: shows [Ad Td] (high card Ace)'
  , 'DmelloH collected 34702 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 34702 | Rake 0'
  , 'Board [Ks 8h 9c Jc 6c]'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) showed [Qd Kh] and won (34702) with a pair of Kings'
  , 'Seat 9: held showed [Ad Td] and lost with high card Ace'
  , ''
  , ''
  , '*********** # 8 **************'
  , 'PokerStars Hand #149652008315: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:30:41 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (5375 in chips)'
  , 'Seat 3: Irisha2 (26414 in chips)'
  , 'Seat 4: DmelloH (14951 in chips)'
  , 'Seat 9: held (20760 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 400'
  , 'Irisha2: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kd 4d]'
  , 'DmelloH: raises 800 to 1600'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Irisha2: calls 800'
  , '*** FLOP *** [Jd 2c Ac]'
  , 'Irisha2: checks'
  , 'DmelloH: bets 1900'
  , 'Irisha2: folds'
  , 'Uncalled bet (1900) returned to DmelloH'
  , 'DmelloH collected 3800 from pot'
  , 'DmelloH: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 3800 | Rake 0'
  , 'Board [Jd 2c Ac]'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded on the Flop'
  , 'Seat 4: DmelloH collected (3800)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 9 **************'
  , 'PokerStars Hand #149652003458: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:30:22 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (7025 in chips)'
  , 'Seat 3: Irisha2 (24264 in chips)'
  , 'Seat 4: DmelloH (15001 in chips)'
  , 'Seat 9: held (21210 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 400'
  , 'Fischersito: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ts 3s]'
  , 'Irisha2: raises 800 to 1600'
  , 'DmelloH: folds'
  , 'held: folds'
  , 'Fischersito: calls 800'
  , '*** FLOP *** [3d Kc Kh]'
  , 'Fischersito: checks'
  , 'Irisha2: bets 800'
  , 'Fischersito: folds'
  , 'Uncalled bet (800) returned to Irisha2'
  , 'Irisha2 collected 3800 from pot'
  , 'Irisha2: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 3800 | Rake 0'
  , 'Board [3d Kc Kh]'
  , 'Seat 1: Fischersito (big blind) folded on the Flop'
  , 'Seat 3: Irisha2 collected (3800)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 10 **************'
  , 'PokerStars Hand #149651992548: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:29:41 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (15875 in chips)'
  , 'Seat 3: Irisha2 (14114 in chips)'
  , 'Seat 4: DmelloH (15451 in chips)'
  , 'Seat 9: held (22060 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 400'
  , 'held: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [4c 2d]'
  , 'Fischersito: raises 800 to 1600'
  , 'Irisha2: calls 1600'
  , 'DmelloH: folds'
  , 'held: folds'
  , '*** FLOP *** [3c Jc 3h]'
  , 'Fischersito: bets 2400'
  , 'Irisha2: calls 2400'
  , '*** TURN *** [3c Jc 3h] [6h]'
  , 'Fischersito: checks'
  , 'Irisha2: bets 1600'
  , 'Fischersito: calls 1600'
  , '*** RIVER *** [3c Jc 3h 6h] [3d]'
  , 'Fischersito: checks'
  , 'Irisha2: bets 3200'
  , 'Fischersito: calls 3200'
  , '*** SHOW DOWN ***'
  , 'Irisha2: shows [Jh Qs] (a full house, Threes full of Jacks)'
  , 'Fischersito: mucks hand'
  , 'Irisha2 collected 19000 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 19000 | Rake 0'
  , 'Board [3c Jc 3h 6h 3d]'
  , 'Seat 1: Fischersito mucked [Td Tc]'
  , 'Seat 3: Irisha2 (button) showed [Jh Qs] and won (19000) with a full house, Threes full of Jacks'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 9: held (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 11 **************'
  , 'PokerStars Hand #149651986994: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:29:20 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (14525 in chips)'
  , 'Seat 3: Irisha2 (14564 in chips)'
  , 'Seat 4: DmelloH (16301 in chips)'
  , 'Seat 9: held (22110 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 400'
  , 'DmelloH: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ah 2c]'
  , 'held: folds'
  , 'Fischersito: raises 800 to 1600'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (800) returned to Fischersito'
  , 'Fischersito collected 2200 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2200 | Rake 0'
  , 'Seat 1: Fischersito (button) collected (2200)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded before Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 12 **************'
  , 'PokerStars Hand #149651982765: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:29:05 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (14975 in chips)'
  , 'Seat 3: Irisha2 (15414 in chips)'
  , 'Seat 4: DmelloH (16351 in chips)'
  , 'Seat 9: held (20760 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 400'
  , 'Irisha2: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jh Ts]'
  , 'DmelloH: folds'
  , 'held: raises 1088 to 1888'
  , 'Fischersito: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (1088) returned to held'
  , 'held collected 2200 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2200 | Rake 0'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) collected (2200)'
  , ''
  , ''
  , '*********** # 13 **************'
  , 'PokerStars Hand #149651974379: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:28:33 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (15825 in chips)'
  , 'Seat 3: Irisha2 (15464 in chips)'
  , 'Seat 4: DmelloH (16401 in chips)'
  , 'Seat 9: held (19810 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 400'
  , 'Fischersito: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [6c 3c]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: calls 400'
  , 'Fischersito: checks'
  , '*** FLOP *** [2c 7h 6d]'
  , 'held: bets 999'
  , 'Fischersito: folds'
  , 'Uncalled bet (999) returned to held'
  , 'held collected 1800 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1800 | Rake 0'
  , 'Board [2c 7h 6d]'
  , 'Seat 1: Fischersito (big blind) folded on the Flop'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) collected (1800)'
  , ''
  , ''
  , '*********** # 14 **************'
  , 'PokerStars Hand #149651956955: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:27:28 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (15875 in chips)'
  , 'Seat 3: Irisha2 (11092 in chips)'
  , 'Seat 4: DmelloH (16851 in chips)'
  , 'Seat 9: held (23682 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 400'
  , 'held: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ks 5d]'
  , 'Fischersito: folds'
  , 'Irisha2: raises 800 to 1600'
  , 'DmelloH: folds'
  , 'held: calls 800'
  , '*** FLOP *** [Ac 4s 2c]'
  , 'held: checks'
  , 'Irisha2: checks'
  , '*** TURN *** [Ac 4s 2c] [3h]'
  , 'held: bets 2222'
  , 'Irisha2: raises 2578 to 4800'
  , 'held: folds'
  , 'Uncalled bet (2578) returned to Irisha2'
  , 'Irisha2 collected 8244 from pot'
  , 'Irisha2: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 8244 | Rake 0'
  , 'Board [Ac 4s 2c 3h]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (button) collected (8244)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 9: held (big blind) folded on the Turn'
  , ''
  , ''
  , '*********** # 15 **************'
  , 'PokerStars Hand #149651945936: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:26:46 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (13725 in chips)'
  , 'Seat 3: Irisha2 (11542 in chips)'
  , 'Seat 4: DmelloH (18501 in chips)'
  , 'Seat 9: held (23732 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 400'
  , 'DmelloH: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [2c Jc]'
  , 'held: folds'
  , 'Fischersito: raises 800 to 1600'
  , 'Irisha2: folds'
  , 'DmelloH: calls 800'
  , '*** FLOP *** [8s 7d 4c]'
  , 'DmelloH: checks'
  , 'Fischersito: bets 1600'
  , 'DmelloH: folds'
  , 'Uncalled bet (1600) returned to Fischersito'
  , 'Fischersito collected 3800 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 3800 | Rake 0'
  , 'Board [8s 7d 4c]'
  , 'Seat 1: Fischersito (button) collected (3800)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded on the Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 16 **************'
  , 'PokerStars Hand #149651931213: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:25:51 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (14175 in chips)'
  , 'Seat 3: Irisha2 (15880 in chips)'
  , 'Seat 4: DmelloH (18551 in chips)'
  , 'Seat 9: held (18894 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 400'
  , 'Irisha2: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ts Ad]'
  , 'DmelloH: folds'
  , 'held: raises 1088 to 1888'
  , 'Fischersito: folds'
  , 'Irisha2: calls 1088'
  , '*** FLOP *** [9s 3h 2h]'
  , 'Irisha2: checks'
  , 'held: checks'
  , '*** TURN *** [9s 3h 2h] [8s]'
  , 'Irisha2: bets 1600'
  , 'held: calls 1600'
  , '*** RIVER *** [9s 3h 2h 8s] [Kc]'
  , 'Irisha2: bets 800'
  , 'held: raises 3644 to 4444'
  , 'Irisha2: folds'
  , 'Uncalled bet (3644) returned to held'
  , 'held collected 9176 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 9176 | Rake 0'
  , 'Board [9s 3h 2h 8s Kc]'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded on the River'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) collected (9176)'
  , ''
  , ''
  , '*********** # 17 **************'
  , 'PokerStars Hand #149651928183: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level XI (400/800) - 2016/03/01 1:25:39 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (13625 in chips)'
  , 'Seat 3: Irisha2 (15930 in chips)'
  , 'Seat 4: DmelloH (18601 in chips)'
  , 'Seat 9: held (19344 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 400'
  , 'Fischersito: posts big blind 800'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [5d 7s]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: folds'
  , 'Uncalled bet (400) returned to Fischersito'
  , 'Fischersito collected 1000 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1000 | Rake 0'
  , 'Seat 1: Fischersito (big blind) collected (1000)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 18 **************'
  , 'PokerStars Hand #149651921849: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:25:15 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (13675 in chips)'
  , 'Seat 3: Irisha2 (15980 in chips)'
  , 'Seat 4: DmelloH (18951 in chips)'
  , 'Seat 9: held (18894 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 300'
  , 'held: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ts Jh]'
  , 'Fischersito: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (300) returned to held'
  , 'held collected 800 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 800 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 9: held (big blind) collected (800)'
  , ''
  , ''
  , '*********** # 19 **************'
  , 'PokerStars Hand #149651916252: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:24:54 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (13725 in chips)'
  , 'Seat 2: Thore H (6202 in chips)'
  , 'Seat 3: Irisha2 (16330 in chips)'
  , 'Seat 4: DmelloH (12299 in chips)'
  , 'Seat 9: held (18944 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 300'
  , 'DmelloH: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Js 8c]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: raises 5552 to 6152 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: calls 5552'
  , '*** FLOP *** [3c Kc 6s]'
  , '*** TURN *** [3c Kc 6s] [Ac]'
  , '*** RIVER *** [3c Kc 6s Ac] [Kd]'
  , '*** SHOW DOWN ***'
  , 'DmelloH: shows [Jh Ah] (two pair, Aces and Kings)'
  , 'Thore H: shows [Qh 6d] (two pair, Kings and Sixes)'
  , 'DmelloH collected 12854 from pot'
  , 'Thore H finished the tournament in 5th place and received $3.68.'
  , '*** SUMMARY ***'
  , 'Total pot 12854 | Rake 0'
  , 'Board [3c Kc 6s Ac Kd]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) showed [Qh 6d] and lost with two pair, Kings and Sixes'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) showed [Jh Ah] and won (12854) with two pair, Aces and Kings'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 20 **************'
  , 'PokerStars Hand #149651909231: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:24:27 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (13775 in chips)'
  , 'Seat 2: Thore H (6552 in chips)'
  , 'Seat 3: Irisha2 (16980 in chips)'
  , 'Seat 4: DmelloH (12949 in chips)'
  , 'Seat 9: held (17244 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Thore H: posts small blind 300'
  , 'Irisha2: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [As 8d]'
  , 'DmelloH: calls 600'
  , 'held: raises 1622 to 2222'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (1622) returned to held'
  , 'held collected 2350 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2350 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop'
  , 'Seat 9: held collected (2350)'
  , ''
  , ''
  , '*********** # 21 **************'
  , 'PokerStars Hand #149651893755: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:23:29 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (10575 in chips)'
  , 'Seat 2: Thore H (7202 in chips)'
  , 'Seat 3: Irisha2 (18830 in chips)'
  , 'Seat 4: DmelloH (12999 in chips)'
  , 'Seat 9: held (17894 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 300'
  , 'Thore H: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ks 9s]'
  , 'Irisha2: calls 600'
  , 'DmelloH: folds'
  , 'held: calls 600'
  , 'Fischersito: calls 300'
  , 'Thore H: checks'
  , '*** FLOP *** [3d 6c Ts]'
  , 'Fischersito: checks'
  , 'Thore H: checks'
  , 'Irisha2: checks'
  , 'held: checks'
  , '*** TURN *** [3d 6c Ts] [Jh]'
  , 'Fischersito: bets 1200'
  , 'Thore H: folds'
  , 'Irisha2: calls 1200'
  , 'held: folds'
  , '*** RIVER *** [3d 6c Ts Jh] [Th]'
  , 'Fischersito: bets 2400'
  , 'Irisha2: folds'
  , 'Uncalled bet (2400) returned to Fischersito'
  , 'Fischersito collected 5050 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 5050 | Rake 0'
  , 'Board [3d 6c Ts Jh Th]'
  , 'Seat 1: Fischersito (small blind) collected (5050)'
  , 'Seat 2: Thore H (big blind) folded on the Turn'
  , 'Seat 3: Irisha2 folded on the River'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) folded on the Turn'
  , ''
  , ''
  , '*********** # 22 **************'
  , 'PokerStars Hand #149651886903: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:23:03 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (11225 in chips)'
  , 'Seat 2: Thore H (7252 in chips)'
  , 'Seat 3: Irisha2 (18880 in chips)'
  , 'Seat 4: DmelloH (13049 in chips)'
  , 'Seat 9: held (17094 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 300'
  , 'Fischersito: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [8s Kd]'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: raises 955 to 1555'
  , 'Fischersito: folds'
  , 'Uncalled bet (955) returned to held'
  , 'held collected 1450 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1450 | Rake 0'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) collected (1450)'
  , ''
  , ''
  , '*********** # 23 **************'
  , 'PokerStars Hand #149651882646: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:22:47 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (11275 in chips)'
  , 'Seat 2: Thore H (6152 in chips)'
  , 'Seat 3: Irisha2 (18930 in chips)'
  , 'Seat 4: DmelloH (13399 in chips)'
  , 'Seat 9: held (17744 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 300'
  , 'held: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ks 9c]'
  , 'Fischersito: folds'
  , 'Thore H: raises 5502 to 6102 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: folds'
  , 'Uncalled bet (5502) returned to Thore H'
  , 'Thore H collected 1750 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 1750 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H collected (1750)'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 9: held (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 24 **************'
  , 'PokerStars Hand #149651877870: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:22:29 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (11325 in chips)'
  , 'Seat 2: Thore H (5052 in chips)'
  , 'Seat 3: Irisha2 (19280 in chips)'
  , 'Seat 4: DmelloH (14049 in chips)'
  , 'Seat 9: held (17794 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 300'
  , 'DmelloH: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [5s 6h]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: raises 4402 to 5002 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (4402) returned to Thore H'
  , 'Thore H collected 1750 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 1750 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) collected (1750)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded before Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 25 **************'
  , 'PokerStars Hand #149651873405: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:22:12 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (11375 in chips)'
  , 'Seat 2: Thore H (5402 in chips)'
  , 'Seat 3: Irisha2 (19930 in chips)'
  , 'Seat 4: DmelloH (14099 in chips)'
  , 'Seat 9: held (16694 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Thore H: posts small blind 300'
  , 'Irisha2: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jd Ad]'
  , 'DmelloH: folds'
  , 'held: raises 1066 to 1666'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (1066) returned to held'
  , 'held collected 1750 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1750 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held collected (1750)'
  , ''
  , ''
  , '*********** # 26 **************'
  , 'PokerStars Hand #149651865486: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:21:42 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (8775 in chips)'
  , 'Seat 2: Thore H (7852 in chips)'
  , 'Seat 3: Irisha2 (19980 in chips)'
  , 'Seat 4: DmelloH (14149 in chips)'
  , 'Seat 9: held (16744 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 300'
  , 'Thore H: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jc 5d]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'held: folds'
  , 'Fischersito: raises 600 to 1200'
  , 'Thore H: calls 600'
  , '*** FLOP *** [9c Jd 4d]'
  , 'Fischersito: bets 1200'
  , 'Thore H: calls 1200'
  , '*** TURN *** [9c Jd 4d] [Ad]'
  , 'Fischersito: bets 6325 and is all-in'
  , 'Thore H: folds'
  , 'Uncalled bet (6325) returned to Fischersito'
  , 'Fischersito collected 5050 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 5050 | Rake 0'
  , 'Board [9c Jd 4d Ad]'
  , 'Seat 1: Fischersito (small blind) collected (5050)'
  , 'Seat 2: Thore H (big blind) folded on the Turn'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 27 **************'
  , 'PokerStars Hand #149651857513: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:21:12 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (8825 in chips)'
  , 'Seat 2: Thore H (7902 in chips)'
  , 'Seat 3: Irisha2 (20030 in chips)'
  , 'Seat 4: DmelloH (6923 in chips)'
  , 'Seat 7: sapinho1001 (6426 in chips)'
  , 'Seat 9: held (17394 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'sapinho1001: posts small blind 300'
  , 'held: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kh 5h]'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: raises 600 to 1200'
  , 'sapinho1001: raises 5176 to 6376 and is all-in'
  , 'held: folds'
  , 'DmelloH: calls 5176'
  , '*** FLOP *** [3c 9s 2c]'
  , '*** TURN *** [3c 9s 2c] [6d]'
  , '*** RIVER *** [3c 9s 2c 6d] [3s]'
  , '*** SHOW DOWN ***'
  , 'sapinho1001: shows [Ac Qc] (a pair of Threes)'
  , 'DmelloH: shows [As 9d] (two pair, Nines and Threes)'
  , 'DmelloH collected 13652 from pot'
  , 'sapinho1001 finished the tournament in 6th place and received $2.45.'
  , '*** SUMMARY ***'
  , 'Total pot 13652 | Rake 0'
  , 'Board [3c 9s 2c 6d 3s]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) showed [As 9d] and won (13652) with two pair, Nines and Threes'
  , 'Seat 7: sapinho1001 (small blind) showed [Ac Qc] and lost with a pair of Threes'
  , 'Seat 9: held (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 28 **************'
  , 'PokerStars Hand #149651845200: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:20:25 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (8875 in chips)'
  , 'Seat 2: Thore H (7952 in chips)'
  , 'Seat 3: Irisha2 (20080 in chips)'
  , 'Seat 4: DmelloH (10036 in chips)'
  , 'Seat 7: sapinho1001 (3113 in chips)'
  , 'Seat 9: held (17444 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 300'
  , 'sapinho1001: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qc 7s]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: raises 1200 to 1800'
  , 'sapinho1001: raises 1263 to 3063 and is all-in'
  , 'DmelloH: calls 1263'
  , '*** FLOP *** [Kh 6h 3h]'
  , '*** TURN *** [Kh 6h 3h] [3c]'
  , '*** RIVER *** [Kh 6h 3h 3c] [5d]'
  , '*** SHOW DOWN ***'
  , 'DmelloH: shows [Jc As] (a pair of Threes)'
  , 'sapinho1001: shows [9h Kd] (two pair, Kings and Threes)'
  , 'sapinho1001 collected 6426 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 6426 | Rake 0'
  , 'Board [Kh 6h 3h 3c 5d]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) showed [Jc As] and lost with a pair of Threes'
  , 'Seat 7: sapinho1001 (big blind) showed [9h Kd] and won (6426) with two pair, Kings and Threes'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 29 **************'
  , 'PokerStars Hand #149651836462: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:19:52 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (8925 in chips)'
  , 'Seat 2: Thore H (8002 in chips)'
  , 'Seat 3: Irisha2 (19230 in chips)'
  , 'Seat 4: DmelloH (10686 in chips)'
  , 'Seat 7: sapinho1001 (3163 in chips)'
  , 'Seat 9: held (17494 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 300'
  , 'DmelloH: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qs 5h]'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: raises 1200 to 1800'
  , 'DmelloH: folds [7s 3c]'
  , 'Uncalled bet (1200) returned to Irisha2'
  , 'Irisha2 collected 1500 from pot'
  , 'Irisha2: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1500 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (small blind) collected (1500)'
  , 'Seat 4: DmelloH (big blind) folded before Flop'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 30 **************'
  , 'PokerStars Hand #149651828360: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:19:20 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (8975 in chips)'
  , 'Seat 2: Thore H (7152 in chips)'
  , 'Seat 3: Irisha2 (19880 in chips)'
  , 'Seat 4: DmelloH (10736 in chips)'
  , 'Seat 7: sapinho1001 (3213 in chips)'
  , 'Seat 9: held (17544 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Thore H: posts small blind 300'
  , 'Irisha2: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [7c Tc]'
  , 'sapinho1001 said, ":("'
  , 'DmelloH: folds'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: raises 6502 to 7102 and is all-in'
  , 'Irisha2: folds'
  , 'Uncalled bet (6502) returned to Thore H'
  , 'Thore H collected 1500 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 1500 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) collected (1500)'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 31 **************'
  , 'PokerStars Hand #149651819511: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:18:46 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (8875 in chips)'
  , 'Seat 2: Thore H (7052 in chips)'
  , 'Seat 3: Irisha2 (19930 in chips)'
  , 'Seat 4: DmelloH (10786 in chips)'
  , 'Seat 7: sapinho1001 (3263 in chips)'
  , 'Seat 9: held (17594 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 300'
  , 'Thore H: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jd 9d]'
  , 'Thore H said, "..i.."'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: raises 8225 to 8825 and is all-in'
  , 'Thore H: calls 6402 and is all-in'
  , 'Uncalled bet (1823) returned to Fischersito'
  , '*** FLOP *** [5s 2h 7c]'
  , '*** TURN *** [5s 2h 7c] [5h]'
  , '*** RIVER *** [5s 2h 7c 5h] [Kh]'
  , '*** SHOW DOWN ***'
  , 'Fischersito: shows [Kd Jc] (two pair, Kings and Fives)'
  , 'Thore H: shows [Js Kc] (two pair, Kings and Fives)'
  , 'Fischersito collected 7152 from pot'
  , 'Thore H collected 7152 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 14304 | Rake 0'
  , 'Board [5s 2h 7c 5h Kh]'
  , 'Seat 1: Fischersito (small blind) showed [Kd Jc] and won (7152) with two pair, Kings and Fives'
  , 'Seat 2: Thore H (big blind) showed [Js Kc] and won (7152) with two pair, Kings and Fives'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 32 **************'
  , 'PokerStars Hand #149651812794: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:18:20 ET'
  , 'Table \'1495192630 3\' 9-max Seat #7 is the button'
  , 'Seat 1: Fischersito (9525 in chips)'
  , 'Seat 2: Thore H (2976 in chips)'
  , 'Seat 3: Irisha2 (19980 in chips)'
  , 'Seat 4: DmelloH (10836 in chips)'
  , 'Seat 7: sapinho1001 (6239 in chips)'
  , 'Seat 9: held (17944 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'held: posts small blind 300'
  , 'Fischersito: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [6c 5s]'
  , 'Thore H: raises 2326 to 2926 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'sapinho1001: raises 3263 to 6189 and is all-in'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Uncalled bet (3263) returned to sapinho1001'
  , '*** FLOP *** [8h 3h Kc]'
  , '*** TURN *** [8h 3h Kc] [9d]'
  , '*** RIVER *** [8h 3h Kc 9d] [5h]'
  , '*** SHOW DOWN ***'
  , 'Thore H: shows [9h Th] (a flush, Ten high)'
  , 'sapinho1001: shows [Js Qd] (high card King)'
  , 'Thore H collected 7052 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 7052 | Rake 0'
  , 'Board [8h 3h Kc 9d 5h]'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 2: Thore H showed [9h Th] and won (7052) with a flush, Ten high'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 (button) showed [Js Qd] and lost with high card King'
  , 'Seat 9: held (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 33 **************'
  , 'PokerStars Hand #149651806838: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:17:58 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (9575 in chips)'
  , 'Seat 2: Thore H (1238 in chips)'
  , 'Seat 3: Irisha2 (20030 in chips)'
  , 'Seat 4: DmelloH (10886 in chips)'
  , 'Seat 7: sapinho1001 (6589 in chips)'
  , 'Seat 9: held (19182 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'sapinho1001: posts small blind 300'
  , 'held: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [9c 6h]'
  , 'Fischersito: folds'
  , 'Thore H: raises 588 to 1188 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'sapinho1001: folds'
  , 'held: calls 588'
  , '*** FLOP *** [5s 6s 7c]'
  , '*** TURN *** [5s 6s 7c] [As]'
  , '*** RIVER *** [5s 6s 7c As] [5d]'
  , '*** SHOW DOWN ***'
  , 'held: shows [9c 6h] (two pair, Sixes and Fives)'
  , 'Thore H: shows [Ah 3d] (two pair, Aces and Fives)'
  , 'Thore H collected 2976 from pot'
  , 'Thore H said, "nh  w anker"'
  , '*** SUMMARY ***'
  , 'Total pot 2976 | Rake 0'
  , 'Board [5s 6s 7c As 5d]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H showed [Ah 3d] and won (2976) with two pair, Aces and Fives'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 (small blind) folded before Flop'
  , 'Seat 9: held (big blind) showed [9c 6h] and lost with two pair, Sixes and Fives'
  , ''
  , ''
  , '*********** # 34 **************'
  , 'PokerStars Hand #149651795996: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:17:16 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (9625 in chips)'
  , 'Seat 2: Thore H (6281 in chips)'
  , 'Seat 3: Irisha2 (20080 in chips)'
  , 'Seat 4: DmelloH (5043 in chips)'
  , 'Seat 7: sapinho1001 (7239 in chips)'
  , 'Seat 9: held (19232 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'DmelloH: posts small blind 300'
  , 'sapinho1001: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [7s 8d]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: raises 5631 to 6231 and is all-in'
  , 'Irisha2: folds'
  , 'DmelloH: calls 4693 and is all-in'
  , 'sapinho1001: folds'
  , 'Uncalled bet (1238) returned to Thore H'
  , '*** FLOP *** [5d 3s Qd]'
  , '*** TURN *** [5d 3s Qd] [6d]'
  , '*** RIVER *** [5d 3s Qd 6d] [Qh]'
  , '*** SHOW DOWN ***'
  , 'DmelloH: shows [Kd Qs] (three of a kind, Queens)'
  , 'Thore H: shows [2h Ad] (a pair of Queens)'
  , 'DmelloH collected 10886 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 10886 | Rake 0'
  , 'Board [5d 3s Qd 6d Qh]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H showed [2h Ad] and lost with a pair of Queens'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) showed [Kd Qs] and won (10886) with three of a kind, Queens'
  , 'Seat 7: sapinho1001 (big blind) folded before Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 35 **************'
  , 'PokerStars Hand #149651785759: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:16:36 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (9675 in chips)'
  , 'Seat 2: Thore H (7886 in chips)'
  , 'Seat 3: Irisha2 (20430 in chips)'
  , 'Seat 4: DmelloH (5693 in chips)'
  , 'Seat 7: sapinho1001 (7289 in chips)'
  , 'Seat 9: held (16527 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Irisha2: posts small blind 300'
  , 'DmelloH: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jc Jd]'
  , 'sapinho1001: folds'
  , 'held: raises 955 to 1555'
  , 'Fischersito: folds'
  , 'Thore H: calls 1555'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , '*** FLOP *** [Qs 3d 6c]'
  , 'held: bets 3333'
  , 'Thore H: folds'
  , 'Uncalled bet (3333) returned to held'
  , 'held collected 4310 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 4310 | Rake 0'
  , 'Board [Qs 3d 6c]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) folded on the Flop'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded before Flop'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held collected (4310)'
  , ''
  , ''
  , '*********** # 36 **************'
  , 'PokerStars Hand #149651782063: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:16:23 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (9725 in chips)'
  , 'Seat 2: Thore H (8236 in chips)'
  , 'Seat 3: Irisha2 (21080 in chips)'
  , 'Seat 4: DmelloH (4543 in chips)'
  , 'Seat 7: sapinho1001 (7339 in chips)'
  , 'Seat 9: held (16577 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Thore H: posts small blind 300'
  , 'Irisha2: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [5h Qc]'
  , 'DmelloH: raises 3893 to 4493 and is all-in'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (3893) returned to DmelloH'
  , 'DmelloH collected 1800 from pot'
  , 'DmelloH: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1800 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH collected (1800)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 37 **************'
  , 'PokerStars Hand #149651770677: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level X (300/600) - 2016/03/01 1:15:39 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (10075 in chips)'
  , 'Seat 2: Thore H (8886 in chips)'
  , 'Seat 3: Irisha2 (21130 in chips)'
  , 'Seat 4: DmelloH (5193 in chips)'
  , 'Seat 7: sapinho1001 (5589 in chips)'
  , 'Seat 9: held (16627 in chips)'
  , 'Fischersito: posts the ante 50'
  , 'Thore H: posts the ante 50'
  , 'Irisha2: posts the ante 50'
  , 'DmelloH: posts the ante 50'
  , 'sapinho1001: posts the ante 50'
  , 'held: posts the ante 50'
  , 'Fischersito: posts small blind 300'
  , 'Thore H: posts big blind 600'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ks 5h]'
  , 'Irisha2: folds'
  , 'DmelloH: calls 600'
  , 'sapinho1001: raises 4939 to 5539 and is all-in'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'DmelloH: folds'
  , 'Uncalled bet (4939) returned to sapinho1001'
  , 'sapinho1001 collected 2400 from pot'
  , 'sapinho1001: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2400 | Rake 0'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 2: Thore H (big blind) folded before Flop'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop'
  , 'Seat 7: sapinho1001 collected (2400)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 38 **************'
  , 'PokerStars Hand #149651762906: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:15:09 ET'
  , 'Table \'1495192630 3\' 9-max Seat #7 is the button'
  , 'Seat 1: Fischersito (10500 in chips)'
  , 'Seat 2: Thore H (8911 in chips)'
  , 'Seat 3: Irisha2 (21155 in chips)'
  , 'Seat 4: DmelloH (5218 in chips)'
  , 'Seat 7: sapinho1001 (4864 in chips)'
  , 'Seat 9: held (16852 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'held: posts small blind 200'
  , 'Fischersito: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [4s Jc]'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'sapinho1001: raises 4439 to 4839 and is all-in'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Uncalled bet (4439) returned to sapinho1001'
  , 'sapinho1001 collected 1150 from pot'
  , 'sapinho1001: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1150 | Rake 0'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 (button) collected (1150)'
  , 'Seat 9: held (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 39 **************'
  , 'PokerStars Hand #149651749145: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:14:17 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (6770 in chips)'
  , 'Seat 2: Thore H (8936 in chips)'
  , 'Seat 3: Irisha2 (21180 in chips)'
  , 'Seat 4: DmelloH (5243 in chips)'
  , 'Seat 5: Zanussof (3205 in chips)'
  , 'Seat 7: sapinho1001 (5289 in chips)'
  , 'Seat 9: held (16877 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Zanussof: posts small blind 200'
  , 'sapinho1001: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [7h Qh]'
  , 'held: folds'
  , 'Fischersito: raises 800 to 1200'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: raises 1980 to 3180 and is all-in'
  , 'sapinho1001: folds'
  , 'Fischersito: calls 1980'
  , '*** FLOP *** [Jh Ts 5d]'
  , '*** TURN *** [Jh Ts 5d] [Th]'
  , '*** RIVER *** [Jh Ts 5d Th] [Qd]'
  , '*** SHOW DOWN ***'
  , 'Zanussof: shows [Ac Js] (two pair, Jacks and Tens)'
  , 'Fischersito: shows [Tc 9c] (three of a kind, Tens)'
  , 'Fischersito collected 6935 from pot'
  , 'Zanussof finished the tournament in 7th place and received $1.43.'
  , '*** SUMMARY ***'
  , 'Total pot 6935 | Rake 0'
  , 'Board [Jh Ts 5d Th Qd]'
  , 'Seat 1: Fischersito showed [Tc 9c] and won (6935) with three of a kind, Tens'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof (small blind) showed [Ac Js] and lost with two pair, Jacks and Tens'
  , 'Seat 7: sapinho1001 (big blind) folded before Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 40 **************'
  , 'PokerStars Hand #149651743214: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:13:54 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (6795 in chips)'
  , 'Seat 2: Thore H (8186 in chips)'
  , 'Seat 3: Irisha2 (21205 in chips)'
  , 'Seat 4: DmelloH (5468 in chips)'
  , 'Seat 5: Zanussof (3630 in chips)'
  , 'Seat 7: sapinho1001 (5314 in chips)'
  , 'Seat 9: held (16902 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'DmelloH: posts small blind 200'
  , 'Zanussof: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Th Kd]'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: raises 400 to 800'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'Uncalled bet (400) returned to Thore H'
  , 'Thore H collected 1175 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 1175 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H collected (1175)'
  , 'Seat 3: Irisha2 (button) folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 5: Zanussof (big blind) folded before Flop'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 41 **************'
  , 'PokerStars Hand #149651738024: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:13:35 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (6820 in chips)'
  , 'Seat 2: Thore H (8211 in chips)'
  , 'Seat 3: Irisha2 (21430 in chips)'
  , 'Seat 4: DmelloH (5118 in chips)'
  , 'Seat 5: Zanussof (3655 in chips)'
  , 'Seat 7: sapinho1001 (5339 in chips)'
  , 'Seat 9: held (16927 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Irisha2: posts small blind 200'
  , 'DmelloH: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [3s 9d]'
  , 'Zanussof: folds'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (200) returned to DmelloH'
  , 'DmelloH collected 575 from pot'
  , 'DmelloH: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 575 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) collected (575)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 42 **************'
  , 'PokerStars Hand #149651728008: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:12:56 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (6845 in chips)'
  , 'Seat 2: Thore H (8436 in chips)'
  , 'Seat 3: Irisha2 (21855 in chips)'
  , 'Seat 4: DmelloH (5143 in chips)'
  , 'Seat 5: Zanussof (3680 in chips)'
  , 'Seat 7: sapinho1001 (4589 in chips)'
  , 'Seat 9: held (16952 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Thore H: posts small blind 200'
  , 'Irisha2: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ah 8c]'
  , 'Irisha2 said, "&&&&"'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'Thore H said, "hope u die fast"'
  , 'Irisha2 said, "????????????"'
  , 'sapinho1001: raises 800 to 1200'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (800) returned to sapinho1001'
  , 'sapinho1001 collected 1175 from pot'
  , 'sapinho1001: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1175 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 collected (1175)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 43 **************'
  , 'PokerStars Hand #149651722267: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:12:34 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (7070 in chips)'
  , 'Seat 2: Thore H (8861 in chips)'
  , 'Seat 3: Irisha2 (21880 in chips)'
  , 'Seat 4: DmelloH (5168 in chips)'
  , 'Seat 5: Zanussof (3705 in chips)'
  , 'Seat 7: sapinho1001 (3839 in chips)'
  , 'Seat 9: held (16977 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Fischersito: posts small blind 200'
  , 'Thore H: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ad 9h]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'Thore H said, "russian  b astard"'
  , 'sapinho1001: raises 3414 to 3814 and is all-in'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Uncalled bet (3414) returned to sapinho1001'
  , 'sapinho1001 collected 1175 from pot'
  , 'sapinho1001: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1175 | Rake 0'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 2: Thore H (big blind) folded before Flop'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 collected (1175)'
  , 'Seat 9: held (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 44 **************'
  , 'PokerStars Hand #149651707278: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:11:36 ET'
  , 'Table \'1495192630 3\' 9-max Seat #7 is the button'
  , 'Seat 1: Fischersito (7495 in chips)'
  , 'Seat 2: Thore H (19085 in chips)'
  , 'Seat 3: Irisha2 (10224 in chips)'
  , 'Seat 4: DmelloH (5193 in chips)'
  , 'Seat 5: Zanussof (3730 in chips)'
  , 'Seat 6: morena211 (707 in chips)'
  , 'Seat 7: sapinho1001 (3864 in chips)'
  , 'Seat 9: held (17202 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'held: posts small blind 200'
  , 'Fischersito: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kd 9h]'
  , 'Thore H: raises 400 to 800'
  , 'Irisha2: raises 800 to 1600'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: calls 682 and is all-in'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: calls 800'
  , '*** FLOP *** [As Qs 5h]'
  , 'Thore H: checks'
  , 'Irisha2: bets 1600'
  , 'Thore H: calls 1600'
  , '*** TURN *** [As Qs 5h] [8c]'
  , 'Thore H: checks'
  , 'Irisha2: bets 2800'
  , 'Thore H: calls 2800'
  , '*** RIVER *** [As Qs 5h 8c] [Qc]'
  , 'Thore H: bets 13060 and is all-in'
  , 'Irisha2: calls 4199 and is all-in'
  , 'Uncalled bet (8861) returned to Thore H'
  , '*** SHOW DOWN ***'
  , 'Thore H: shows [Ac Th] (two pair, Aces and Queens)'
  , 'Irisha2: shows [Ah Qh] (a full house, Queens full of Aces)'
  , 'Irisha2 collected 19034 from side pot'
  , 'morena211: shows [6h 6c] (two pair, Queens and Sixes)'
  , 'Irisha2 collected 2846 from main pot'
  , 'morena211 finished the tournament in 8th place'
  , '*** SUMMARY ***'
  , 'Total pot 21880 Main pot 2846. Side pot 19034. | Rake 0'
  , 'Board [As Qs 5h 8c Qc]'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 2: Thore H showed [Ac Th] and lost with two pair, Aces and Queens'
  , 'Seat 3: Irisha2 showed [Ah Qh] and won (21880) with a full house, Queens full of Aces'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 showed [6h 6c] and lost with two pair, Queens and Sixes'
  , 'Seat 7: sapinho1001 (button) folded before Flop (didn\'t bet)'
  , 'Seat 9: held (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 45 **************'
  , 'PokerStars Hand #149651699619: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:11:07 ET'
  , 'Table \'1495192630 3\' 9-max Seat #6 is the button'
  , 'Seat 1: Fischersito (6720 in chips)'
  , 'Seat 2: Thore H (19110 in chips)'
  , 'Seat 3: Irisha2 (10249 in chips)'
  , 'Seat 4: DmelloH (5218 in chips)'
  , 'Seat 5: Zanussof (3755 in chips)'
  , 'Seat 6: morena211 (732 in chips)'
  , 'Seat 7: sapinho1001 (4089 in chips)'
  , 'Seat 9: held (17627 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'sapinho1001: posts small blind 200'
  , 'held: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [9d Ah]'
  , 'Fischersito: raises 800 to 1200'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Uncalled bet (800) returned to Fischersito'
  , 'Fischersito collected 1200 from pot'
  , 'Fischersito: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1200 | Rake 0'
  , 'Seat 1: Fischersito collected (1200)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 (button) folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 (small blind) folded before Flop'
  , 'Seat 9: held (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 46 **************'
  , 'PokerStars Hand #149651691265: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:10:35 ET'
  , 'Table \'1495192630 3\' 9-max Seat #5 is the button'
  , 'Seat 1: Fischersito (6745 in chips)'
  , 'Seat 2: Thore H (19135 in chips)'
  , 'Seat 3: Irisha2 (10274 in chips)'
  , 'Seat 4: DmelloH (5243 in chips)'
  , 'Seat 5: Zanussof (3780 in chips)'
  , 'Seat 6: morena211 (1157 in chips)'
  , 'Seat 7: sapinho1001 (3514 in chips)'
  , 'Seat 9: held (17652 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'morena211: posts small blind 200'
  , 'sapinho1001: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qs 6d]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: calls 200'
  , 'sapinho1001: raises 1000 to 1400'
  , 'morena211: folds'
  , 'Uncalled bet (1000) returned to sapinho1001'
  , 'sapinho1001 collected 1000 from pot'
  , 'sapinho1001: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1000 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof (button) folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 (small blind) folded before Flop'
  , 'Seat 7: sapinho1001 (big blind) collected (1000)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 47 **************'
  , 'PokerStars Hand #149651683447: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:10:05 ET'
  , 'Table \'1495192630 3\' 9-max Seat #4 is the button'
  , 'Seat 1: Fischersito (6770 in chips)'
  , 'Seat 2: Thore H (19160 in chips)'
  , 'Seat 3: Irisha2 (10299 in chips)'
  , 'Seat 4: DmelloH (5268 in chips)'
  , 'Seat 5: Zanussof (4005 in chips)'
  , 'Seat 6: morena211 (1582 in chips)'
  , 'Seat 7: sapinho1001 (3539 in chips)'
  , 'Seat 9: held (16877 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Zanussof: posts small blind 200'
  , 'morena211: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [As 8s]'
  , 'sapinho1001: folds'
  , 'held: raises 757 to 1157'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'Uncalled bet (757) returned to held'
  , 'held collected 1200 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1200 | Rake 0'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH (button) folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof (small blind) folded before Flop'
  , 'Seat 6: morena211 (big blind) folded before Flop'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held collected (1200)'
  , ''
  , ''
  , '*********** # 48 **************'
  , 'PokerStars Hand #149651676973: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:09:41 ET'
  , 'Table \'1495192630 3\' 9-max Seat #3 is the button'
  , 'Seat 1: Fischersito (6795 in chips)'
  , 'Seat 2: Thore H (19185 in chips)'
  , 'Seat 3: Irisha2 (9524 in chips)'
  , 'Seat 4: DmelloH (5493 in chips)'
  , 'Seat 5: Zanussof (4430 in chips)'
  , 'Seat 6: morena211 (1607 in chips)'
  , 'Seat 7: sapinho1001 (3564 in chips)'
  , 'Seat 9: held (16902 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'DmelloH: posts small blind 200'
  , 'Zanussof: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jc 9s]'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: calls 400'
  , 'DmelloH: folds'
  , 'Zanussof: checks'
  , '*** FLOP *** [Jh 5c Ac]'
  , 'Zanussof: checks'
  , 'Irisha2: bets 400'
  , 'Zanussof: folds'
  , 'Uncalled bet (400) returned to Irisha2'
  , 'Irisha2 collected 1200 from pot'
  , 'Irisha2: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1200 | Rake 0'
  , 'Board [Jh 5c Ac]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (button) collected (1200)'
  , 'Seat 4: DmelloH (small blind) folded before Flop'
  , 'Seat 5: Zanussof (big blind) folded on the Flop'
  , 'Seat 6: morena211 folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 49 **************'
  , 'PokerStars Hand #149651661616: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:08:43 ET'
  , 'Table \'1495192630 3\' 9-max Seat #2 is the button'
  , 'Seat 1: Fischersito (6820 in chips)'
  , 'Seat 2: Thore H (19210 in chips)'
  , 'Seat 3: Irisha2 (9749 in chips)'
  , 'Seat 4: DmelloH (6517 in chips)'
  , 'Seat 5: Zanussof (4455 in chips)'
  , 'Seat 6: morena211 (1632 in chips)'
  , 'Seat 7: sapinho1001 (3589 in chips)'
  , 'Seat 9: held (15528 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Irisha2: posts small blind 200'
  , 'DmelloH: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ts Ac]'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'held: raises 599 to 999'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: calls 599'
  , '*** FLOP *** [4c Jd Jc]'
  , 'DmelloH: checks'
  , 'held: bets 1111'
  , 'DmelloH: folds'
  , 'Uncalled bet (1111) returned to held'
  , 'held collected 2398 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2398 | Rake 0'
  , 'Board [4c Jd Jc]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (button) folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 (small blind) folded before Flop'
  , 'Seat 4: DmelloH (big blind) folded on the Flop'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held collected (2398)'
  , ''
  , ''
  , '*********** # 50 **************'
  , 'PokerStars Hand #149651655180: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:08:18 ET'
  , 'Table \'1495192630 3\' 9-max Seat #1 is the button'
  , 'Seat 1: Fischersito (6845 in chips)'
  , 'Seat 2: Thore H (19435 in chips)'
  , 'Seat 3: Irisha2 (10174 in chips)'
  , 'Seat 4: DmelloH (6542 in chips)'
  , 'Seat 5: Zanussof (4480 in chips)'
  , 'Seat 6: morena211 (1657 in chips)'
  , 'Seat 7: sapinho1001 (3614 in chips)'
  , 'Seat 9: held (14753 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Thore H: posts small blind 200'
  , 'Irisha2: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Kd Qd]'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'held: raises 599 to 999'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'Uncalled bet (599) returned to held'
  , 'held collected 1200 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1200 | Rake 0'
  , 'Seat 1: Fischersito (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 3: Irisha2 (big blind) folded before Flop'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 9: held collected (1200)'
  , ''
  , ''
  , '*********** # 51 **************'
  , 'PokerStars Hand #149651638393: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:07:15 ET'
  , 'Table \'1495192630 3\' 9-max Seat #9 is the button'
  , 'Seat 1: Fischersito (7070 in chips)'
  , 'Seat 2: Thore H (19860 in chips)'
  , 'Seat 3: Irisha2 (10199 in chips)'
  , 'Seat 4: DmelloH (6567 in chips)'
  , 'Seat 5: Zanussof (4505 in chips)'
  , 'Seat 6: morena211 (1682 in chips)'
  , 'Seat 7: sapinho1001 (3639 in chips)'
  , 'Seat 8: celiaobutlee (2893 in chips)'
  , 'Seat 9: held (11085 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'celiaobutlee: posts the ante 25'
  , 'held: posts the ante 25'
  , 'Fischersito: posts small blind 200'
  , 'Thore H: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Td Tc]'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'celiaobutlee: raises 400 to 800'
  , 'held: raises 1199 to 1999'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'celiaobutlee: calls 1199'
  , '*** FLOP *** [4h Kc Ah]'
  , 'celiaobutlee: checks'
  , 'held: bets 869'
  , 'celiaobutlee: calls 869 and is all-in'
  , '*** TURN *** [4h Kc Ah] [Ad]'
  , '*** RIVER *** [4h Kc Ah Ad] [6s]'
  , '*** SHOW DOWN ***'
  , 'celiaobutlee: shows [Jc Qs] (a pair of Aces)'
  , 'held: shows [Td Tc] (two pair, Aces and Tens)'
  , 'held collected 6561 from pot'
  , 'celiaobutlee finished the tournament in 9th place'
  , '*** SUMMARY ***'
  , 'Total pot 6561 | Rake 0'
  , 'Board [4h Kc Ah Ad 6s]'
  , 'Seat 1: Fischersito (small blind) folded before Flop'
  , 'Seat 2: Thore H (big blind) folded before Flop'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 8: celiaobutlee showed [Jc Qs] and lost with a pair of Aces'
  , 'Seat 9: held (button) showed [Td Tc] and won (6561) with two pair, Aces and Tens'
  , ''
  , ''
  , '*********** # 52 **************'
  , 'PokerStars Hand #149651631064: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:06:47 ET'
  , 'Table \'1495192630 3\' 9-max Seat #8 is the button'
  , 'Seat 1: Fischersito (7495 in chips)'
  , 'Seat 2: Thore H (19885 in chips)'
  , 'Seat 3: Irisha2 (10224 in chips)'
  , 'Seat 4: DmelloH (6592 in chips)'
  , 'Seat 5: Zanussof (4530 in chips)'
  , 'Seat 6: morena211 (1707 in chips)'
  , 'Seat 7: sapinho1001 (3664 in chips)'
  , 'Seat 8: celiaobutlee (3718 in chips)'
  , 'Seat 9: held (9685 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'celiaobutlee: posts the ante 25'
  , 'held: posts the ante 25'
  , 'held: posts small blind 200'
  , 'Fischersito: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Jh As]'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: folds'
  , 'celiaobutlee: raises 400 to 800'
  , 'held: raises 1199 to 1999'
  , 'Fischersito: folds'
  , 'celiaobutlee: folds'
  , 'Uncalled bet (1199) returned to held'
  , 'held collected 2225 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 2225 | Rake 0'
  , 'Seat 1: Fischersito (big blind) folded before Flop'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 8: celiaobutlee (button) folded before Flop'
  , 'Seat 9: held (small blind) collected (2225)'
  , ''
  , ''
  , '*********** # 53 **************'
  , 'PokerStars Hand #149651622445: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:06:14 ET'
  , 'Table \'1495192630 3\' 9-max Seat #7 is the button'
  , 'Seat 1: Fischersito (7520 in chips)'
  , 'Seat 2: Thore H (19910 in chips)'
  , 'Seat 3: Irisha2 (6624 in chips)'
  , 'Seat 4: DmelloH (6617 in chips)'
  , 'Seat 5: Zanussof (4555 in chips)'
  , 'Seat 6: morena211 (4532 in chips)'
  , 'Seat 7: sapinho1001 (3689 in chips)'
  , 'Seat 8: celiaobutlee (3943 in chips)'
  , 'Seat 9: held (10110 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'celiaobutlee: posts the ante 25'
  , 'held: posts the ante 25'
  , 'celiaobutlee: posts small blind 200'
  , 'held: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [7d 5h]'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: raises 800 to 1200'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: calls 1200'
  , 'sapinho1001: folds'
  , 'celiaobutlee: folds'
  , 'held: folds'
  , '*** FLOP *** [2h 2c 3c]'
  , 'Irisha2: bets 400'
  , 'morena211: calls 400'
  , '*** TURN *** [2h 2c 3c] [4d]'
  , 'Irisha2: bets 400'
  , 'morena211: calls 400'
  , '*** RIVER *** [2h 2c 3c 4d] [3s]'
  , 'Irisha2: bets 800'
  , 'morena211: calls 800'
  , '*** SHOW DOWN ***'
  , 'Irisha2: shows [Ad Qs] (two pair, Threes and Deuces)'
  , 'morena211: mucks hand'
  , 'Irisha2 collected 6425 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 6425 | Rake 0'
  , 'Board [2h 2c 3c 4d 3s]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 showed [Ad Qs] and won (6425) with two pair, Threes and Deuces'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 mucked [Th Kd]'
  , 'Seat 7: sapinho1001 (button) folded before Flop (didn\'t bet)'
  , 'Seat 8: celiaobutlee (small blind) folded before Flop'
  , 'Seat 9: held (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 54 **************'
  , 'PokerStars Hand #149651611173: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level IX (200/400) - 2016/03/01 1:05:32 ET'
  , 'Table \'1495192630 3\' 9-max Seat #6 is the button'
  , 'Seat 1: Fischersito (7545 in chips)'
  , 'Seat 2: Thore H (19935 in chips)'
  , 'Seat 3: Irisha2 (6649 in chips)'
  , 'Seat 4: DmelloH (3021 in chips)'
  , 'Seat 5: Zanussof (4580 in chips)'
  , 'Seat 6: morena211 (4557 in chips)'
  , 'Seat 7: sapinho1001 (6710 in chips)'
  , 'Seat 8: celiaobutlee (4368 in chips)'
  , 'Seat 9: held (10135 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'celiaobutlee: posts the ante 25'
  , 'held: posts the ante 25'
  , 'sapinho1001: posts small blind 200'
  , 'celiaobutlee: posts big blind 400'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [2c 7c]'
  , 'held: folds'
  , 'Fischersito: folds'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: raises 800 to 1200'
  , 'Zanussof: folds'
  , 'morena211: folds'
  , 'sapinho1001: raises 3025 to 4225'
  , 'celiaobutlee: folds'
  , 'DmelloH: calls 1796 and is all-in'
  , 'Uncalled bet (1229) returned to sapinho1001'
  , '*** FLOP *** [Qh 6c Jh]'
  , '*** TURN *** [Qh 6c Jh] [Th]'
  , '*** RIVER *** [Qh 6c Jh Th] [9c]'
  , '*** SHOW DOWN ***'
  , 'sapinho1001: shows [8h 8s] (a straight, Eight to Queen)'
  , 'DmelloH: shows [Kh Kc] (a straight, Nine to King)'
  , 'DmelloH collected 6617 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 6617 | Rake 0'
  , 'Board [Qh 6c Jh Th 9c]'
  , 'Seat 1: Fischersito folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH showed [Kh Kc] and won (6617) with a straight, Nine to King'
  , 'Seat 5: Zanussof folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 (button) folded before Flop (didn\'t bet)'
  , 'Seat 7: sapinho1001 (small blind) showed [8h 8s] and lost with a straight, Eight to Queen'
  , 'Seat 8: celiaobutlee (big blind) folded before Flop'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 55 **************'
  , 'PokerStars Hand #149651593944: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:04:26 ET'
  , 'Table \'1495192630 3\' 9-max Seat #5 is the button'
  , 'Seat 1: Fischersito (5245 in chips)'
  , 'Seat 2: Thore H (19960 in chips)'
  , 'Seat 3: Irisha2 (6674 in chips)'
  , 'Seat 4: DmelloH (3046 in chips)'
  , 'Seat 5: Zanussof (4605 in chips)'
  , 'Seat 6: morena211 (6382 in chips)'
  , 'Seat 7: sapinho1001 (7035 in chips)'
  , 'Seat 8: celiaobutlee (4393 in chips)'
  , 'Seat 9: held (10160 in chips)'
  , 'Fischersito: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Irisha2: posts the ante 25'
  , 'DmelloH: posts the ante 25'
  , 'Zanussof: posts the ante 25'
  , 'morena211: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'celiaobutlee: posts the ante 25'
  , 'held: posts the ante 25'
  , 'morena211: posts small blind 150'
  , 'sapinho1001: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Td Qd]'
  , 'celiaobutlee: folds'
  , 'held: folds'
  , 'Fischersito: raises 300 to 600'
  , 'Thore H: folds'
  , 'Irisha2: folds'
  , 'DmelloH: folds'
  , 'Zanussof: folds'
  , 'morena211: calls 450'
  , 'sapinho1001: folds'
  , '*** FLOP *** [Kc Ah 6h]'
  , 'morena211: checks'
  , 'Fischersito: bets 900'
  , 'morena211: calls 900'
  , '*** TURN *** [Kc Ah 6h] [5d]'
  , 'morena211: checks'
  , 'Fischersito: checks'
  , '*** RIVER *** [Kc Ah 6h 5d] [8d]'
  , 'morena211: bets 300'
  , 'Fischersito: calls 300'
  , '*** SHOW DOWN ***'
  , 'morena211: shows [Th Ks] (a pair of Kings)'
  , 'Fischersito: shows [As 7s] (a pair of Aces)'
  , 'Fischersito collected 4125 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 4125 | Rake 0'
  , 'Board [Kc Ah 6h 5d 8d]'
  , 'Seat 1: Fischersito showed [As 7s] and won (4125) with a pair of Aces'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 3: Irisha2 folded before Flop (didn\'t bet)'
  , 'Seat 4: DmelloH folded before Flop (didn\'t bet)'
  , 'Seat 5: Zanussof (button) folded before Flop (didn\'t bet)'
  , 'Seat 6: morena211 (small blind) showed [Th Ks] and lost with a pair of Kings'
  , 'Seat 7: sapinho1001 (big blind) folded before Flop'
  , 'Seat 8: celiaobutlee folded before Flop (didn\'t bet)'
  , 'Seat 9: held folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 56 **************'
  , 'PokerStars Hand #149651573400: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:03:08 ET'
  , 'Table \'1495192630 2\' 9-max Seat #1 is the button'
  , 'Seat 1: held (10185 in chips)'
  , 'Seat 2: Thore H (14716 in chips)'
  , 'Seat 3: Fischersito (5570 in chips)'
  , 'Seat 6: sapinho1001 (8235 in chips)'
  , 'Seat 7: shibaba420 (3694 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Fischersito: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'Thore H: posts small blind 150'
  , 'Fischersito: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qc 2h]'
  , 'sapinho1001: raises 875 to 1175'
  , 'shibaba420: raises 2494 to 3669 and is all-in'
  , 'held: folds'
  , 'Thore H: raises 11022 to 14691 and is all-in'
  , 'Fischersito: folds'
  , 'sapinho1001: folds'
  , 'Uncalled bet (11022) returned to Thore H'
  , '*** FLOP *** [Ad Td 9h]'
  , '*** TURN *** [Ad Td 9h] [4d]'
  , '*** RIVER *** [Ad Td 9h 4d] [9d]'
  , '*** SHOW DOWN ***'
  , 'Thore H: shows [Kh Kd] (a flush, Ace high)'
  , 'shibaba420: shows [Qh Ac] (two pair, Aces and Nines)'
  , 'Thore H collected 8938 from pot'
  , 'shibaba420 finished the tournament in 10th place'
  , '*** SUMMARY ***'
  , 'Total pot 8938 | Rake 0'
  , 'Board [Ad Td 9h 4d 9d]'
  , 'Seat 1: held (button) folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H (small blind) showed [Kh Kd] and won (8938) with a flush, Ace high'
  , 'Seat 3: Fischersito (big blind) folded before Flop'
  , 'Seat 6: sapinho1001 folded before Flop'
  , 'Seat 7: shibaba420 showed [Qh Ac] and lost with two pair, Aces and Nines'
  , ''
  , ''
  , '*********** # 57 **************'
  , 'PokerStars Hand #149651558342: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:02:10 ET'
  , 'Table \'1495192630 2\' 9-max Seat #7 is the button'
  , 'Seat 1: held (10360 in chips)'
  , 'Seat 2: Thore H (13166 in chips)'
  , 'Seat 6: sapinho1001 (9585 in chips)'
  , 'Seat 7: shibaba420 (3719 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'held: posts small blind 150'
  , 'Thore H: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [6d Tc]'
  , 'sapinho1001: raises 300 to 600'
  , 'shibaba420: folds'
  , 'held: folds'
  , 'Thore H: calls 300'
  , '*** FLOP *** [2h 7d 9d]'
  , 'Thore H: checks'
  , 'sapinho1001: bets 725'
  , 'Thore H: calls 725'
  , '*** TURN *** [2h 7d 9d] [Kd]'
  , 'Thore H: checks'
  , 'sapinho1001: checks'
  , '*** RIVER *** [2h 7d 9d Kd] [5h]'
  , 'Thore H: bets 600'
  , 'sapinho1001: folds'
  , 'Uncalled bet (600) returned to Thore H'
  , 'Thore H collected 2900 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 2900 | Rake 0'
  , 'Board [2h 7d 9d Kd 5h]'
  , 'Seat 1: held (small blind) folded before Flop'
  , 'Seat 2: Thore H (big blind) collected (2900)'
  , 'Seat 6: sapinho1001 folded on the River'
  , 'Seat 7: shibaba420 (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 58 **************'
  , 'PokerStars Hand #149651550769: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:01:40 ET'
  , 'Table \'1495192630 2\' 9-max Seat #6 is the button'
  , 'Seat 1: held (10685 in chips)'
  , 'Seat 2: Thore H (13191 in chips)'
  , 'Seat 5: Lukaz516 (1582 in chips)'
  , 'Seat 6: sapinho1001 (7478 in chips)'
  , 'Seat 7: shibaba420 (3894 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'shibaba420: posts small blind 150'
  , 'held: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [7d Td]'
  , 'Thore H: folds'
  , 'Lukaz516: raises 1257 to 1557 and is all-in'
  , 'sapinho1001: calls 1557'
  , 'shibaba420: folds'
  , 'held: folds'
  , '*** FLOP *** [4c 7s 3d]'
  , '*** TURN *** [4c 7s 3d] [Ad]'
  , '*** RIVER *** [4c 7s 3d Ad] [Jd]'
  , '*** SHOW DOWN ***'
  , 'Lukaz516: shows [Jh Qh] (a pair of Jacks)'
  , 'sapinho1001: shows [7h As] (two pair, Aces and Sevens)'
  , 'sapinho1001 collected 3689 from pot'
  , 'Lukaz516 finished the tournament in 11th place'
  , '*** SUMMARY ***'
  , 'Total pot 3689 | Rake 0'
  , 'Board [4c 7s 3d Ad Jd]'
  , 'Seat 1: held (big blind) folded before Flop'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 5: Lukaz516 showed [Jh Qh] and lost with a pair of Jacks'
  , 'Seat 6: sapinho1001 (button) showed [7h As] and won (3689) with two pair, Aces and Sevens'
  , 'Seat 7: shibaba420 (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 59 **************'
  , 'PokerStars Hand #149651545430: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:01:19 ET'
  , 'Table \'1495192630 2\' 9-max Seat #5 is the button'
  , 'Seat 1: held (10710 in chips)'
  , 'Seat 2: Thore H (12641 in chips)'
  , 'Seat 5: Lukaz516 (1607 in chips)'
  , 'Seat 6: sapinho1001 (7653 in chips)'
  , 'Seat 7: shibaba420 (4219 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'sapinho1001: posts small blind 150'
  , 'shibaba420: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [2c 4h]'
  , 'held: folds'
  , 'Thore H: raises 300 to 600'
  , 'Lukaz516: folds'
  , 'sapinho1001: folds'
  , 'shibaba420: folds'
  , 'Uncalled bet (300) returned to Thore H'
  , 'Thore H collected 875 from pot'
  , '*** SUMMARY ***'
  , 'Total pot 875 | Rake 0'
  , 'Seat 1: held folded before Flop (didn\'t bet)'
  , 'Seat 2: Thore H collected (875)'
  , 'Seat 5: Lukaz516 (button) folded before Flop (didn\'t bet)'
  , 'Seat 6: sapinho1001 (small blind) folded before Flop'
  , 'Seat 7: shibaba420 (big blind) folded before Flop'
  , ''
  , ''
  , '*********** # 60 **************'
  , 'PokerStars Hand #149651529496: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 1:00:17 ET'
  , 'Table \'1495192630 2\' 9-max Seat #2 is the button'
  , 'Seat 1: held (10160 in chips)'
  , 'Seat 2: Thore H (12666 in chips)'
  , 'Seat 5: Lukaz516 (1782 in chips)'
  , 'Seat 6: sapinho1001 (7978 in chips)'
  , 'Seat 7: shibaba420 (4244 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'Lukaz516: posts small blind 150'
  , 'sapinho1001: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ah 8d]'
  , 'shibaba420: folds'
  , 'held: raises 477 to 777'
  , 'Thore H: folds'
  , 'Lukaz516: folds'
  , 'sapinho1001: folds'
  , 'Uncalled bet (477) returned to held'
  , 'held collected 875 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 875 | Rake 0'
  , 'Seat 1: held collected (875)'
  , 'Seat 2: Thore H (button) folded before Flop (didn\'t bet)'
  , 'Seat 5: Lukaz516 (small blind) folded before Flop'
  , 'Seat 6: sapinho1001 (big blind) folded before Flop'
  , 'Seat 7: shibaba420 folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 61 **************'
  , 'PokerStars Hand #149651451985: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 0:54:57 ET'
  , 'Table \'1495192630 2\' 9-max Seat #1 is the button'
  , 'Seat 1: held (9610 in chips)'
  , 'Seat 2: Thore H (12841 in chips)'
  , 'Seat 5: Lukaz516 (2107 in chips)'
  , 'Seat 6: sapinho1001 (8003 in chips)'
  , 'Seat 7: shibaba420 (4269 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'Thore H: posts small blind 150'
  , 'Lukaz516: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [8s Jd]'
  , 'sapinho1001: folds'
  , 'shibaba420: folds'
  , 'held: raises 477 to 777'
  , 'Thore H: folds'
  , 'Lukaz516: folds'
  , 'Uncalled bet (477) returned to held'
  , 'held collected 875 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 875 | Rake 0'
  , 'Seat 1: held (button) collected (875)'
  , 'Seat 2: Thore H (small blind) folded before Flop'
  , 'Seat 5: Lukaz516 (big blind) folded before Flop'
  , 'Seat 6: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 7: shibaba420 folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 62 **************'
  , 'PokerStars Hand #149651439997: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 0:54:13 ET'
  , 'Table \'1495192630 2\' 9-max Seat #7 is the button'
  , 'Seat 1: held (10301 in chips)'
  , 'Seat 2: Thore H (12075 in chips)'
  , 'Seat 5: Lukaz516 (2132 in chips)'
  , 'Seat 6: sapinho1001 (8028 in chips)'
  , 'Seat 7: shibaba420 (4294 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'held: posts small blind 150'
  , 'Thore H: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Qd Ts]'
  , 'Lukaz516: folds'
  , 'sapinho1001: folds'
  , 'shibaba420: folds'
  , 'held: raises 366 to 666'
  , 'Thore H: raises 11384 to 12050 and is all-in'
  , 'held: folds'
  , 'Uncalled bet (11384) returned to Thore H'
  , 'Thore H collected 1457 from pot'
  , 'Thore H: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 1457 | Rake 0'
  , 'Seat 1: held (small blind) folded before Flop'
  , 'Seat 2: Thore H (big blind) collected (1457)'
  , 'Seat 5: Lukaz516 folded before Flop (didn\'t bet)'
  , 'Seat 6: sapinho1001 folded before Flop (didn\'t bet)'
  , 'Seat 7: shibaba420 (button) folded before Flop (didn\'t bet)'
  , ''
  , ''
  , '*********** # 63 **************'
  , 'PokerStars Hand #149651430063: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 0:53:36 ET'
  , 'Table \'1495192630 2\' 9-max Seat #6 is the button'
  , 'Seat 1: held (9901 in chips)'
  , 'Seat 2: Thore H (12100 in chips)'
  , 'Seat 5: Lukaz516 (2157 in chips)'
  , 'Seat 6: sapinho1001 (8053 in chips)'
  , 'Seat 7: shibaba420 (4619 in chips)'
  , 'held: posts the ante 25'
  , 'Thore H: posts the ante 25'
  , 'Lukaz516: posts the ante 25'
  , 'sapinho1001: posts the ante 25'
  , 'shibaba420: posts the ante 25'
  , 'shibaba420: posts small blind 150'
  , 'held: posts big blind 300'
  , '*** HOLE CARDS ***'
  , 'Dealt to held [Ad 9h]'
  , 'Thore H: folds'
  , 'Lukaz516: folds'
  , 'sapinho1001: folds'
  , 'shibaba420: calls 150'
  , 'held: raises 1033 to 1333'
  , 'shibaba420: folds'
  , 'Uncalled bet (1033) returned to held'
  , 'held collected 725 from pot'
  , 'held: doesn\'t show hand'
  , '*** SUMMARY ***'
  , 'Total pot 725 | Rake 0'
  , 'Seat 1: held (big blind) collected (725)'
  , 'Seat 2: Thore H folded before Flop (didn\'t bet)'
  , 'Seat 5: Lukaz516 folded before Flop (didn\'t bet)'
  , 'Seat 6: sapinho1001 (button) folded before Flop (didn\'t bet)'
  , 'Seat 7: shibaba420 (small blind) folded before Flop'
  , ''
  , ''
  , '*********** # 64 **************'
  , 'PokerStars Hand #149651412132: Tournament #1495192630, $0.91+$0.09 USD Hold\'em No Limit - Level VIII (150/300) - 2016/03/01 0:52:29 ET'
  , 'Table \'1495192630 2\' 9-max Seat #5 is the button'
  , 'Seat 1: held (8085 in chips)'
  , 'Seat 2: Thore H (13391 in chips)'
  , 'Seat 5: Lukaz516 (2182 in chips)'
  , 'Seat 6: sapinho1001 (8228 in chips)'
  , 'Seat 7: shibaba420 (4944 in chips)'
  , 'held: posts the ante 25'
].join('\n')

},{}],15:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const injectStyle     = require('./lib/inject-style')
const templates       = require('./lib/templates')
const sort            = require('./lib/sort')
const css             = templates.css
const filterCss       = templates.filterCss
const selectPlayerCss = templates.selectPlayerCss
const uiFilter        = templates.uiFilter
const head            = templates.head({ css: css })
const holdem          = templates.holdem

function oneDecimal (x) {
  return (x || 0).toFixed(1)
}

function renderSuit (s) {
  switch (s) {
    case 's': return '♠'
    case 'h': return '♥'
    case 'd': return '♦'
    case 'c': return '♣'
  }
}

function renderCard (c) {
  if (typeof c === 'undefined' || c.length < 2) return ''
  const suit = renderSuit(c[1])
  return '<span class="hhv-card-value">'
            + c[0] +
          '</span>' +
          '<span class="hhv-card-suit ' + c[1] + '">'
            + suit +
          '</span>'
}

function renderCards (cards) {
  if (!cards) return ''
  function render (acc, k) {
    acc[k] = renderCard(cards[k])
    return acc
  }
  return Object.keys(cards).reduce(render, {})
}

function shortenActionType (type) {
  return  type === 'fold'     ? 'F'
        : type === 'check'    ? 'X'
        : type === 'call'     ? 'C'
        : type === 'bet'      ? 'B'
        : type === 'raise'    ? 'R'
        : type === 'collect'  ? 'W'
        : (console.error('Unknown action type', type), '?')
}

function renderStreet (actions, indent) {
  let s = indent ? '_____ ' : ''
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    // ignore uncalled bets returned
    if (a.type === 'bet-returned') continue
    s +=  shortenActionType(a.type) + ' '
        + (a.hasOwnProperty('ratio')
            ? oneDecimal(a.ratio)
            : '   ')
        + (a.allin ? ' A' : '')
        + ' '
  }
  return s.trim()
}

function normalizePlayerName (n) {
  return n.replace(/ /g, '_')
}

function namePlayer (p) { return p.name }

function renderPlayer (p) {
  const info = {
      pos            : (p.pos || '??').toUpperCase()
    , name           : p.name
    , normalizedName : normalizePlayerName(p.name)
    , cards          : p.cards
    , renderedCards  : renderCards(p.cards)
    , m              : p.m
    , preflop        : renderStreet(p.preflop, p.bb || p.sb)
    , flop           : renderStreet(p.flop, false)
    , turn           : renderStreet(p.turn, false)
    , river          : renderStreet(p.river, false)
    , showdown       : renderStreet(p.showdown, false)
  }
  let playerActivity = info.normalizedName
  if (p.invested) playerActivity += ' invested'
  if (p.sawFlop) playerActivity += ' sawFlop'
  info.playerActivity = playerActivity
  return info
}

function renderInfo (analyzed, players) {
  const info = {
      bb       : analyzed.bb
    , sb       : analyzed.sb
    , ante     : analyzed.ante
    , board    : analyzed.board
    , year     : analyzed.year
    , month    : analyzed.month
    , day      : analyzed.day
    , hour     : analyzed.hour
    , min      : analyzed.min
    , sec      : analyzed.sec
    , gametype : analyzed.gametype
    , gameno   : analyzed.gameno
    , handid   : analyzed.handid
  }

  info.anyActivity = ''
  info.playerActivity = ''

  if (analyzed.anyInvested) info.anyActivity += ' any-invested '
  if (analyzed.anySawFlop) info.anyActivity += ' any-sawFlop '

  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    const name = normalizePlayerName(p.name)
    info.playerActivity += ' ' + name
    if (p.invested) info.playerActivity +=  ' ' + name + '-invested'
    if (p.sawFlop) info.playerActivity +=  ' ' + name + '-sawFlop'
  }
  return info
}

exports.css       = css()
exports.filterCss = filterCss
exports.head      = head

exports.injectStyle = injectStyle

exports.filterHands = function filterHands (opts) {
  // create class definitions to trigger which player rows and which hands are shown
  let handFilter = ''
  let playersFilter = ''
  if (opts.players) {
    handFilter += '.any-' + opts.players.filter
    playersFilter = '.' + opts.players.filter
  }
  if (opts.hand) {
    handFilter += '.' + opts.hand.who + '-' + opts.hand.filter
  }
  const filter = { hand: handFilter, players: playersFilter }
  injectStyle(filterCss(filter), document, 'hand-filter')
}

exports.selectPlayer = function selectPlayer (selected, name) {
  injectStyle(selectPlayerCss({ selected: selected, name: name }), document, 'player-select')
}

const prepareRender = exports.prepareRender = function prepareRender (analyzed) {
  const info = {
      info            : renderInfo(analyzed.info, analyzed.players)
    , table           : analyzed.table
    , board           : analyzed.board
    , renderedBoard   : renderCards(analyzed.board)
    , players         : analyzed.players
    , renderedPlayers : analyzed.players.map(renderPlayer)
  }

  return {
      info: info
    , players: analyzed.players.map(namePlayer)
  }
}

function renderChips(analyzed) {
  const hero = analyzed.hero
  let player
  for (let i = 0; i < analyzed.players.length; i++) {
    const p = analyzed.players[i]
    if (p.name === hero) {
      player = p
      break
    }
  }

  if (!player || player.chips === player.chipsAfter) return ''

  return (
    '<div><span>$' +
      player.chips + ' ➡ $' + player.chipsAfter.toFixed(2) +
      ' ($' + (player.chipsAfter - player.chips).toFixed(2) + ')' +
    '</span></div>'
  )
}

exports.render = function render (analyzed, showChips) {
  const prepared = prepareRender(analyzed)
  let html = holdem(prepared.info)
  if (showChips) html += renderChips(analyzed)
  return {
      html: html
    , players: prepared.players
  }
}

exports.normalizePlayerName = normalizePlayerName

exports.pageify = function pageify (renderedHands) {
  const html =
      head
    + '<body>'
      + renderedHands
    + '</body>'
  return html
}

exports.sortByDateTime = sort.byDateTime
exports.sortByDateTimeDescending = sort.byDateTimeDescending

exports.renderFilter = function renderFilter (players, hero) {
  function playerInfo (p) {
    return { name: p, isHero: p === hero }
  }
  return uiFilter({ players: players.map(playerInfo) })
}

// Test
/* eslint-disable no-unused-vars */
function insp (obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, false))
}
function inspect (obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, true))
}
if (!module.parent && typeof window === 'undefined') {
const fs = require('fs')
const path = require('path')

const actiononall = exports.render(require('./test/fixtures/holdem/actiononall.json'))
const allin = exports.render(require('./test/fixtures/holdem/allin-preflop.json'))
const html = exports.pageify(actiononall + allin)
// fs.writeFileSync(path.join(__dirname, 'test.html'), html, 'utf8')
}

},{"./lib/inject-style":18,"./lib/sort":19,"./lib/templates":16,"./test/fixtures/holdem/actiononall.json":52,"./test/fixtures/holdem/allin-preflop.json":53,"fs":20,"path":22,"util":25}],16:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const handlebars = require('hbsfy/runtime')
const helpers = require('./helpers')
helpers(handlebars)

exports.head            = require('../templates/head.hbs')
exports.css             = require('../templates/style.hbs')
exports.filterCss       = require('../templates/style-filter.hbs')
exports.selectPlayerCss = require('../templates/style-select-player.hbs')
exports.uiFilter        = require('../templates/ui-filter.hbs')
exports.holdem          = require('../templates/holdem.hbs')

},{"../templates/head.hbs":46,"../templates/holdem.hbs":47,"../templates/style-filter.hbs":48,"../templates/style-select-player.hbs":49,"../templates/style.hbs":50,"../templates/ui-filter.hbs":51,"./helpers":17,"hbsfy/runtime":45}],17:[function(require,module,exports){
'use strict'

function twoDigits (n) {
  return ('0' + n).slice(-2)
}

module.exports = function helpers (handlebars) {
  handlebars.registerHelper('ifvalue', function (conditional, options) {
    if (options.hash.value === conditional) {
      return options.fn(this)
    } else {
      return options.inverse(this)
    }
  })
  handlebars.registerHelper('twodigits', function (options) {
    return twoDigits(options.fn(this))
  })
}

},{}],18:[function(require,module,exports){
'use strict'

function injectStyleTag (document, id) {
  let style = document.getElementById(id)

  if (!style) {
    const head = document.getElementsByTagName('head')[0]
    style = document.createElement('style')
    if (id != null) style.id = id
    head.appendChild(style)
  }

  return style
}

module.exports = function injectStyle (css, document, id) {
  const style = injectStyleTag(document, id)
  if (style.styleSheet) {
    style.styleSheet.cssText = css
  } else {
    style.innerHTML = css
  }
}

},{}],19:[function(require,module,exports){
'use strict'

function byDateTime (h1, h2) {
  const i1 = h1.info
  const i2 = h2.info
  if (i1.year < i2.year)   return -1
  if (i1.year > i2.year)   return  1
  if (i1.month < i2.month) return -1
  if (i1.month > i2.month) return  1
  if (i1.day < i2.day)     return -1
  if (i1.day > i2.day)     return  1
  if (i1.hour < i2.hour)   return -1
  if (i1.hour > i2.hour)   return  1
  if (i1.min < i2.min)     return -1
  if (i1.min > i2.min)     return  1
  if (i1.sec < i2.sec)     return -1
  if (i1.sec > i2.sec)     return  1
  return 0
}

function byDateTimeDescending (h1, h2) {
  return (-1) * byDateTime(h1, h2)
}

exports.byDateTime = function sortByDateTime (analyzed) {
  return analyzed.sort(byDateTime)
}

exports.byDateTimeDescending = function sortByDateTimeDescending (analyzed) {
  return analyzed.sort(byDateTimeDescending)
}

},{}],20:[function(require,module,exports){

},{}],21:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],22:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":23}],23:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],24:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],25:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":24,"_process":23,"inherits":21}],26:[function(require,module,exports){
'use strict';

exports.__esModule = true;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

// istanbul ignore next

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _handlebarsBase = require('./handlebars/base');

var base = _interopRequireWildcard(_handlebarsBase);

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)

var _handlebarsSafeString = require('./handlebars/safe-string');

var _handlebarsSafeString2 = _interopRequireDefault(_handlebarsSafeString);

var _handlebarsException = require('./handlebars/exception');

var _handlebarsException2 = _interopRequireDefault(_handlebarsException);

var _handlebarsUtils = require('./handlebars/utils');

var Utils = _interopRequireWildcard(_handlebarsUtils);

var _handlebarsRuntime = require('./handlebars/runtime');

var runtime = _interopRequireWildcard(_handlebarsRuntime);

var _handlebarsNoConflict = require('./handlebars/no-conflict');

var _handlebarsNoConflict2 = _interopRequireDefault(_handlebarsNoConflict);

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
function create() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = _handlebarsSafeString2['default'];
  hb.Exception = _handlebarsException2['default'];
  hb.Utils = Utils;
  hb.escapeExpression = Utils.escapeExpression;

  hb.VM = runtime;
  hb.template = function (spec) {
    return runtime.template(spec, hb);
  };

  return hb;
}

var inst = create();
inst.create = create;

_handlebarsNoConflict2['default'](inst);

inst['default'] = inst;

exports['default'] = inst;
module.exports = exports['default'];


},{"./handlebars/base":27,"./handlebars/exception":30,"./handlebars/no-conflict":40,"./handlebars/runtime":41,"./handlebars/safe-string":42,"./handlebars/utils":43}],27:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.HandlebarsEnvironment = HandlebarsEnvironment;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _utils = require('./utils');

var _exception = require('./exception');

var _exception2 = _interopRequireDefault(_exception);

var _helpers = require('./helpers');

var _decorators = require('./decorators');

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

var VERSION = '4.0.5';
exports.VERSION = VERSION;
var COMPILER_REVISION = 7;

exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '== 1.x.x',
  5: '== 2.0.0-alpha.x',
  6: '>= 2.0.0-beta.1',
  7: '>= 4.0.0'
};

exports.REVISION_CHANGES = REVISION_CHANGES;
var objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials, decorators) {
  this.helpers = helpers || {};
  this.partials = partials || {};
  this.decorators = decorators || {};

  _helpers.registerDefaultHelpers(this);
  _decorators.registerDefaultDecorators(this);
}

HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: _logger2['default'],
  log: _logger2['default'].log,

  registerHelper: function registerHelper(name, fn) {
    if (_utils.toString.call(name) === objectType) {
      if (fn) {
        throw new _exception2['default']('Arg not supported with multiple helpers');
      }
      _utils.extend(this.helpers, name);
    } else {
      this.helpers[name] = fn;
    }
  },
  unregisterHelper: function unregisterHelper(name) {
    delete this.helpers[name];
  },

  registerPartial: function registerPartial(name, partial) {
    if (_utils.toString.call(name) === objectType) {
      _utils.extend(this.partials, name);
    } else {
      if (typeof partial === 'undefined') {
        throw new _exception2['default']('Attempting to register a partial called "' + name + '" as undefined');
      }
      this.partials[name] = partial;
    }
  },
  unregisterPartial: function unregisterPartial(name) {
    delete this.partials[name];
  },

  registerDecorator: function registerDecorator(name, fn) {
    if (_utils.toString.call(name) === objectType) {
      if (fn) {
        throw new _exception2['default']('Arg not supported with multiple decorators');
      }
      _utils.extend(this.decorators, name);
    } else {
      this.decorators[name] = fn;
    }
  },
  unregisterDecorator: function unregisterDecorator(name) {
    delete this.decorators[name];
  }
};

var log = _logger2['default'].log;

exports.log = log;
exports.createFrame = _utils.createFrame;
exports.logger = _logger2['default'];


},{"./decorators":28,"./exception":30,"./helpers":31,"./logger":39,"./utils":43}],28:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.registerDefaultDecorators = registerDefaultDecorators;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _decoratorsInline = require('./decorators/inline');

var _decoratorsInline2 = _interopRequireDefault(_decoratorsInline);

function registerDefaultDecorators(instance) {
  _decoratorsInline2['default'](instance);
}


},{"./decorators/inline":29}],29:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _utils = require('../utils');

exports['default'] = function (instance) {
  instance.registerDecorator('inline', function (fn, props, container, options) {
    var ret = fn;
    if (!props.partials) {
      props.partials = {};
      ret = function (context, options) {
        // Create a new partials stack frame prior to exec.
        var original = container.partials;
        container.partials = _utils.extend({}, original, props.partials);
        var ret = fn(context, options);
        container.partials = original;
        return ret;
      };
    }

    props.partials[options.args[0]] = options.fn;

    return ret;
  });
};

module.exports = exports['default'];


},{"../utils":43}],30:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var loc = node && node.loc,
      line = undefined,
      column = undefined;
  if (loc) {
    line = loc.start.line;
    column = loc.start.column;

    message += ' - ' + line + ':' + column;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  /* istanbul ignore else */
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, Exception);
  }

  if (loc) {
    this.lineNumber = line;
    this.column = column;
  }
}

Exception.prototype = new Error();

exports['default'] = Exception;
module.exports = exports['default'];


},{}],31:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.registerDefaultHelpers = registerDefaultHelpers;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _helpersBlockHelperMissing = require('./helpers/block-helper-missing');

var _helpersBlockHelperMissing2 = _interopRequireDefault(_helpersBlockHelperMissing);

var _helpersEach = require('./helpers/each');

var _helpersEach2 = _interopRequireDefault(_helpersEach);

var _helpersHelperMissing = require('./helpers/helper-missing');

var _helpersHelperMissing2 = _interopRequireDefault(_helpersHelperMissing);

var _helpersIf = require('./helpers/if');

var _helpersIf2 = _interopRequireDefault(_helpersIf);

var _helpersLog = require('./helpers/log');

var _helpersLog2 = _interopRequireDefault(_helpersLog);

var _helpersLookup = require('./helpers/lookup');

var _helpersLookup2 = _interopRequireDefault(_helpersLookup);

var _helpersWith = require('./helpers/with');

var _helpersWith2 = _interopRequireDefault(_helpersWith);

function registerDefaultHelpers(instance) {
  _helpersBlockHelperMissing2['default'](instance);
  _helpersEach2['default'](instance);
  _helpersHelperMissing2['default'](instance);
  _helpersIf2['default'](instance);
  _helpersLog2['default'](instance);
  _helpersLookup2['default'](instance);
  _helpersWith2['default'](instance);
}


},{"./helpers/block-helper-missing":32,"./helpers/each":33,"./helpers/helper-missing":34,"./helpers/if":35,"./helpers/log":36,"./helpers/lookup":37,"./helpers/with":38}],32:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _utils = require('../utils');

exports['default'] = function (instance) {
  instance.registerHelper('blockHelperMissing', function (context, options) {
    var inverse = options.inverse,
        fn = options.fn;

    if (context === true) {
      return fn(this);
    } else if (context === false || context == null) {
      return inverse(this);
    } else if (_utils.isArray(context)) {
      if (context.length > 0) {
        if (options.ids) {
          options.ids = [options.name];
        }

        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      if (options.data && options.ids) {
        var data = _utils.createFrame(options.data);
        data.contextPath = _utils.appendContextPath(options.data.contextPath, options.name);
        options = { data: data };
      }

      return fn(context, options);
    }
  });
};

module.exports = exports['default'];


},{"../utils":43}],33:[function(require,module,exports){
'use strict';

exports.__esModule = true;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _utils = require('../utils');

var _exception = require('../exception');

var _exception2 = _interopRequireDefault(_exception);

exports['default'] = function (instance) {
  instance.registerHelper('each', function (context, options) {
    if (!options) {
      throw new _exception2['default']('Must pass iterator to #each');
    }

    var fn = options.fn,
        inverse = options.inverse,
        i = 0,
        ret = '',
        data = undefined,
        contextPath = undefined;

    if (options.data && options.ids) {
      contextPath = _utils.appendContextPath(options.data.contextPath, options.ids[0]) + '.';
    }

    if (_utils.isFunction(context)) {
      context = context.call(this);
    }

    if (options.data) {
      data = _utils.createFrame(options.data);
    }

    function execIteration(field, index, last) {
      if (data) {
        data.key = field;
        data.index = index;
        data.first = index === 0;
        data.last = !!last;

        if (contextPath) {
          data.contextPath = contextPath + field;
        }
      }

      ret = ret + fn(context[field], {
        data: data,
        blockParams: _utils.blockParams([context[field], field], [contextPath + field, null])
      });
    }

    if (context && typeof context === 'object') {
      if (_utils.isArray(context)) {
        for (var j = context.length; i < j; i++) {
          if (i in context) {
            execIteration(i, i, i === context.length - 1);
          }
        }
      } else {
        var priorKey = undefined;

        for (var key in context) {
          if (context.hasOwnProperty(key)) {
            // We're running the iterations one step out of sync so we can detect
            // the last iteration without have to scan the object twice and create
            // an itermediate keys array.
            if (priorKey !== undefined) {
              execIteration(priorKey, i - 1);
            }
            priorKey = key;
            i++;
          }
        }
        if (priorKey !== undefined) {
          execIteration(priorKey, i - 1, true);
        }
      }
    }

    if (i === 0) {
      ret = inverse(this);
    }

    return ret;
  });
};

module.exports = exports['default'];


},{"../exception":30,"../utils":43}],34:[function(require,module,exports){
'use strict';

exports.__esModule = true;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _exception = require('../exception');

var _exception2 = _interopRequireDefault(_exception);

exports['default'] = function (instance) {
  instance.registerHelper('helperMissing', function () /* [args, ]options */{
    if (arguments.length === 1) {
      // A missing field in a {{foo}} construct.
      return undefined;
    } else {
      // Someone is actually trying to call something, blow up.
      throw new _exception2['default']('Missing helper: "' + arguments[arguments.length - 1].name + '"');
    }
  });
};

module.exports = exports['default'];


},{"../exception":30}],35:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _utils = require('../utils');

exports['default'] = function (instance) {
  instance.registerHelper('if', function (conditional, options) {
    if (_utils.isFunction(conditional)) {
      conditional = conditional.call(this);
    }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if (!options.hash.includeZero && !conditional || _utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function (conditional, options) {
    return instance.helpers['if'].call(this, conditional, { fn: options.inverse, inverse: options.fn, hash: options.hash });
  });
};

module.exports = exports['default'];


},{"../utils":43}],36:[function(require,module,exports){
'use strict';

exports.__esModule = true;

exports['default'] = function (instance) {
  instance.registerHelper('log', function () /* message, options */{
    var args = [undefined],
        options = arguments[arguments.length - 1];
    for (var i = 0; i < arguments.length - 1; i++) {
      args.push(arguments[i]);
    }

    var level = 1;
    if (options.hash.level != null) {
      level = options.hash.level;
    } else if (options.data && options.data.level != null) {
      level = options.data.level;
    }
    args[0] = level;

    instance.log.apply(instance, args);
  });
};

module.exports = exports['default'];


},{}],37:[function(require,module,exports){
'use strict';

exports.__esModule = true;

exports['default'] = function (instance) {
  instance.registerHelper('lookup', function (obj, field) {
    return obj && obj[field];
  });
};

module.exports = exports['default'];


},{}],38:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _utils = require('../utils');

exports['default'] = function (instance) {
  instance.registerHelper('with', function (context, options) {
    if (_utils.isFunction(context)) {
      context = context.call(this);
    }

    var fn = options.fn;

    if (!_utils.isEmpty(context)) {
      var data = options.data;
      if (options.data && options.ids) {
        data = _utils.createFrame(options.data);
        data.contextPath = _utils.appendContextPath(options.data.contextPath, options.ids[0]);
      }

      return fn(context, {
        data: data,
        blockParams: _utils.blockParams([context], [data && data.contextPath])
      });
    } else {
      return options.inverse(this);
    }
  });
};

module.exports = exports['default'];


},{"../utils":43}],39:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _utils = require('./utils');

var logger = {
  methodMap: ['debug', 'info', 'warn', 'error'],
  level: 'info',

  // Maps a given level value to the `methodMap` indexes above.
  lookupLevel: function lookupLevel(level) {
    if (typeof level === 'string') {
      var levelMap = _utils.indexOf(logger.methodMap, level.toLowerCase());
      if (levelMap >= 0) {
        level = levelMap;
      } else {
        level = parseInt(level, 10);
      }
    }

    return level;
  },

  // Can be overridden in the host environment
  log: function log(level) {
    level = logger.lookupLevel(level);

    if (typeof console !== 'undefined' && logger.lookupLevel(logger.level) <= level) {
      var method = logger.methodMap[level];
      if (!console[method]) {
        // eslint-disable-line no-console
        method = 'log';
      }

      for (var _len = arguments.length, message = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        message[_key - 1] = arguments[_key];
      }

      console[method].apply(console, message); // eslint-disable-line no-console
    }
  }
};

exports['default'] = logger;
module.exports = exports['default'];


},{"./utils":43}],40:[function(require,module,exports){
(function (global){
/* global window */
'use strict';

exports.__esModule = true;

exports['default'] = function (Handlebars) {
  /* istanbul ignore next */
  var root = typeof global !== 'undefined' ? global : window,
      $Handlebars = root.Handlebars;
  /* istanbul ignore next */
  Handlebars.noConflict = function () {
    if (root.Handlebars === Handlebars) {
      root.Handlebars = $Handlebars;
    }
    return Handlebars;
  };
};

module.exports = exports['default'];


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],41:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.checkRevision = checkRevision;
exports.template = template;
exports.wrapProgram = wrapProgram;
exports.resolvePartial = resolvePartial;
exports.invokePartial = invokePartial;
exports.noop = noop;
// istanbul ignore next

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

// istanbul ignore next

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _utils = require('./utils');

var Utils = _interopRequireWildcard(_utils);

var _exception = require('./exception');

var _exception2 = _interopRequireDefault(_exception);

var _base = require('./base');

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = _base.COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = _base.REVISION_CHANGES[currentRevision],
          compilerVersions = _base.REVISION_CHANGES[compilerRevision];
      throw new _exception2['default']('Template was precompiled with an older version of Handlebars than the current runtime. ' + 'Please update your precompiler to a newer version (' + runtimeVersions + ') or downgrade your runtime to an older version (' + compilerVersions + ').');
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new _exception2['default']('Template was precompiled with a newer version of Handlebars than the current runtime. ' + 'Please update your runtime to a newer version (' + compilerInfo[1] + ').');
    }
  }
}

function template(templateSpec, env) {
  /* istanbul ignore next */
  if (!env) {
    throw new _exception2['default']('No environment passed to template');
  }
  if (!templateSpec || !templateSpec.main) {
    throw new _exception2['default']('Unknown template object: ' + typeof templateSpec);
  }

  templateSpec.main.decorator = templateSpec.main_d;

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  env.VM.checkRevision(templateSpec.compiler);

  function invokePartialWrapper(partial, context, options) {
    if (options.hash) {
      context = Utils.extend({}, context, options.hash);
      if (options.ids) {
        options.ids[0] = true;
      }
    }

    partial = env.VM.resolvePartial.call(this, partial, context, options);
    var result = env.VM.invokePartial.call(this, partial, context, options);

    if (result == null && env.compile) {
      options.partials[options.name] = env.compile(partial, templateSpec.compilerOptions, env);
      result = options.partials[options.name](context, options);
    }
    if (result != null) {
      if (options.indent) {
        var lines = result.split('\n');
        for (var i = 0, l = lines.length; i < l; i++) {
          if (!lines[i] && i + 1 === l) {
            break;
          }

          lines[i] = options.indent + lines[i];
        }
        result = lines.join('\n');
      }
      return result;
    } else {
      throw new _exception2['default']('The partial ' + options.name + ' could not be compiled when running in runtime-only mode');
    }
  }

  // Just add water
  var container = {
    strict: function strict(obj, name) {
      if (!(name in obj)) {
        throw new _exception2['default']('"' + name + '" not defined in ' + obj);
      }
      return obj[name];
    },
    lookup: function lookup(depths, name) {
      var len = depths.length;
      for (var i = 0; i < len; i++) {
        if (depths[i] && depths[i][name] != null) {
          return depths[i][name];
        }
      }
    },
    lambda: function lambda(current, context) {
      return typeof current === 'function' ? current.call(context) : current;
    },

    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,

    fn: function fn(i) {
      var ret = templateSpec[i];
      ret.decorator = templateSpec[i + '_d'];
      return ret;
    },

    programs: [],
    program: function program(i, data, declaredBlockParams, blockParams, depths) {
      var programWrapper = this.programs[i],
          fn = this.fn(i);
      if (data || depths || blockParams || declaredBlockParams) {
        programWrapper = wrapProgram(this, i, fn, data, declaredBlockParams, blockParams, depths);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = wrapProgram(this, i, fn);
      }
      return programWrapper;
    },

    data: function data(value, depth) {
      while (value && depth--) {
        value = value._parent;
      }
      return value;
    },
    merge: function merge(param, common) {
      var obj = param || common;

      if (param && common && param !== common) {
        obj = Utils.extend({}, common, param);
      }

      return obj;
    },

    noop: env.VM.noop,
    compilerInfo: templateSpec.compiler
  };

  function ret(context) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var data = options.data;

    ret._setup(options);
    if (!options.partial && templateSpec.useData) {
      data = initData(context, data);
    }
    var depths = undefined,
        blockParams = templateSpec.useBlockParams ? [] : undefined;
    if (templateSpec.useDepths) {
      if (options.depths) {
        depths = context !== options.depths[0] ? [context].concat(options.depths) : options.depths;
      } else {
        depths = [context];
      }
    }

    function main(context /*, options*/) {
      return '' + templateSpec.main(container, context, container.helpers, container.partials, data, blockParams, depths);
    }
    main = executeDecorators(templateSpec.main, main, container, options.depths || [], data, blockParams);
    return main(context, options);
  }
  ret.isTop = true;

  ret._setup = function (options) {
    if (!options.partial) {
      container.helpers = container.merge(options.helpers, env.helpers);

      if (templateSpec.usePartial) {
        container.partials = container.merge(options.partials, env.partials);
      }
      if (templateSpec.usePartial || templateSpec.useDecorators) {
        container.decorators = container.merge(options.decorators, env.decorators);
      }
    } else {
      container.helpers = options.helpers;
      container.partials = options.partials;
      container.decorators = options.decorators;
    }
  };

  ret._child = function (i, data, blockParams, depths) {
    if (templateSpec.useBlockParams && !blockParams) {
      throw new _exception2['default']('must pass block params');
    }
    if (templateSpec.useDepths && !depths) {
      throw new _exception2['default']('must pass parent depths');
    }

    return wrapProgram(container, i, templateSpec[i], data, 0, blockParams, depths);
  };
  return ret;
}

function wrapProgram(container, i, fn, data, declaredBlockParams, blockParams, depths) {
  function prog(context) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var currentDepths = depths;
    if (depths && context !== depths[0]) {
      currentDepths = [context].concat(depths);
    }

    return fn(container, context, container.helpers, container.partials, options.data || data, blockParams && [options.blockParams].concat(blockParams), currentDepths);
  }

  prog = executeDecorators(fn, prog, container, depths, data, blockParams);

  prog.program = i;
  prog.depth = depths ? depths.length : 0;
  prog.blockParams = declaredBlockParams || 0;
  return prog;
}

function resolvePartial(partial, context, options) {
  if (!partial) {
    if (options.name === '@partial-block') {
      partial = options.data['partial-block'];
    } else {
      partial = options.partials[options.name];
    }
  } else if (!partial.call && !options.name) {
    // This is a dynamic partial that returned a string
    options.name = partial;
    partial = options.partials[partial];
  }
  return partial;
}

function invokePartial(partial, context, options) {
  options.partial = true;
  if (options.ids) {
    options.data.contextPath = options.ids[0] || options.data.contextPath;
  }

  var partialBlock = undefined;
  if (options.fn && options.fn !== noop) {
    options.data = _base.createFrame(options.data);
    partialBlock = options.data['partial-block'] = options.fn;

    if (partialBlock.partials) {
      options.partials = Utils.extend({}, options.partials, partialBlock.partials);
    }
  }

  if (partial === undefined && partialBlock) {
    partial = partialBlock;
  }

  if (partial === undefined) {
    throw new _exception2['default']('The partial ' + options.name + ' could not be found');
  } else if (partial instanceof Function) {
    return partial(context, options);
  }
}

function noop() {
  return '';
}

function initData(context, data) {
  if (!data || !('root' in data)) {
    data = data ? _base.createFrame(data) : {};
    data.root = context;
  }
  return data;
}

function executeDecorators(fn, prog, container, depths, data, blockParams) {
  if (fn.decorator) {
    var props = {};
    prog = fn.decorator(prog, props, container, depths && depths[0], data, blockParams, depths);
    Utils.extend(prog, props);
  }
  return prog;
}


},{"./base":27,"./exception":30,"./utils":43}],42:[function(require,module,exports){
// Build out our basic SafeString type
'use strict';

exports.__esModule = true;
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = SafeString.prototype.toHTML = function () {
  return '' + this.string;
};

exports['default'] = SafeString;
module.exports = exports['default'];


},{}],43:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.extend = extend;
exports.indexOf = indexOf;
exports.escapeExpression = escapeExpression;
exports.isEmpty = isEmpty;
exports.createFrame = createFrame;
exports.blockParams = blockParams;
exports.appendContextPath = appendContextPath;
var escape = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

var badChars = /[&<>"'`=]/g,
    possible = /[&<>"'`=]/;

function escapeChar(chr) {
  return escape[chr];
}

function extend(obj /* , ...source */) {
  for (var i = 1; i < arguments.length; i++) {
    for (var key in arguments[i]) {
      if (Object.prototype.hasOwnProperty.call(arguments[i], key)) {
        obj[key] = arguments[i][key];
      }
    }
  }

  return obj;
}

var toString = Object.prototype.toString;

exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
/* eslint-disable func-style */
var isFunction = function isFunction(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
/* istanbul ignore next */
if (isFunction(/x/)) {
  exports.isFunction = isFunction = function (value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
exports.isFunction = isFunction;

/* eslint-enable func-style */

/* istanbul ignore next */
var isArray = Array.isArray || function (value) {
  return value && typeof value === 'object' ? toString.call(value) === '[object Array]' : false;
};

exports.isArray = isArray;
// Older IE versions do not directly support indexOf so we must implement our own, sadly.

function indexOf(array, value) {
  for (var i = 0, len = array.length; i < len; i++) {
    if (array[i] === value) {
      return i;
    }
  }
  return -1;
}

function escapeExpression(string) {
  if (typeof string !== 'string') {
    // don't escape SafeStrings, since they're already safe
    if (string && string.toHTML) {
      return string.toHTML();
    } else if (string == null) {
      return '';
    } else if (!string) {
      return string + '';
    }

    // Force a string conversion as this will be done by the append regardless and
    // the regex test will do this transparently behind the scenes, causing issues if
    // an object's to string has escaped characters in it.
    string = '' + string;
  }

  if (!possible.test(string)) {
    return string;
  }
  return string.replace(badChars, escapeChar);
}

function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

function createFrame(object) {
  var frame = extend({}, object);
  frame._parent = object;
  return frame;
}

function blockParams(params, ids) {
  params.path = ids;
  return params;
}

function appendContextPath(contextPath, id) {
  return (contextPath ? contextPath + '.' : '') + id;
}


},{}],44:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime')['default'];

},{"./dist/cjs/handlebars.runtime":26}],45:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":44}],46:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper;

  return "<head>\n  <meta charset=\"utf-8\">\n  <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Inconsolata\">\n  <style type=\"text/css\">"
    + ((stack1 = ((helper = (helper = helpers.css || (depth0 != null ? depth0.css : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : {},{"name":"css","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</style>\n</head>\n";
},"useData":true});

},{"hbsfy/runtime":45}],47:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "        ("
    + container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.ante : stack1), depth0))
    + ")\n";
},"3":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=depth0 != null ? depth0 : {};

  return "      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card1 : stack1),{"name":"if","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card2 : stack1),{"name":"if","hash":{},"fn":container.program(6, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card3 : stack1),{"name":"if","hash":{},"fn":container.program(8, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card4 : stack1),{"name":"if","hash":{},"fn":container.program(10, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card5 : stack1),{"name":"if","hash":{},"fn":container.program(12, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n";
},"4":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card1 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"6":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card2 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"8":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card3 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"10":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card4 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"12":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.renderedBoard : depth0)) != null ? stack1.card5 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"14":function(container,depth0,helpers,partials,data) {
    return "      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\n";
},"16":function(container,depth0,helpers,partials,data) {
    var stack1, helper, options, alias1=depth0 != null ? depth0 : {}, alias2=helpers.helperMissing, alias3="function", alias4=helpers.blockHelperMissing, buffer = 
  "    <span class=\"hhv-date\">\n      ";
  stack1 = ((helper = (helper = helpers.twodigits || (depth0 != null ? depth0.twodigits : depth0)) != null ? helper : alias2),(options={"name":"twodigits","hash":{},"fn":container.program(17, data, 0),"inverse":container.noop,"data":data}),(typeof helper === alias3 ? helper.call(alias1,options) : helper));
  if (!helpers.twodigits) { stack1 = alias4.call(depth0,stack1,options)}
  if (stack1 != null) { buffer += stack1; }
  buffer += "/";
  stack1 = ((helper = (helper = helpers.twodigits || (depth0 != null ? depth0.twodigits : depth0)) != null ? helper : alias2),(options={"name":"twodigits","hash":{},"fn":container.program(19, data, 0),"inverse":container.noop,"data":data}),(typeof helper === alias3 ? helper.call(alias1,options) : helper));
  if (!helpers.twodigits) { stack1 = alias4.call(depth0,stack1,options)}
  if (stack1 != null) { buffer += stack1; }
  return buffer + "/"
    + container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.year : stack1), depth0))
    + "\n    </span>\n";
},"17":function(container,depth0,helpers,partials,data) {
    var stack1;

  return container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.month : stack1), depth0));
},"19":function(container,depth0,helpers,partials,data) {
    var stack1;

  return container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.day : stack1), depth0));
},"21":function(container,depth0,helpers,partials,data) {
    var stack1;

  return container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.hour : stack1), depth0));
},"23":function(container,depth0,helpers,partials,data) {
    var stack1;

  return container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.min : stack1), depth0));
},"25":function(container,depth0,helpers,partials,data) {
    var stack1;

  return container.escapeExpression(container.lambda(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.sec : stack1), depth0));
},"27":function(container,depth0,helpers,partials,data) {
    return " T: ";
},"29":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : {}, alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression, alias5=container.lambda;

  return "      <tr class=\"hhv-player "
    + alias4(((helper = (helper = helpers.playerActivity || (depth0 != null ? depth0.playerActivity : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"playerActivity","hash":{},"data":data}) : helper)))
    + "\">\n        <td>"
    + alias4(((helper = (helper = helpers.pos || (depth0 != null ? depth0.pos : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"pos","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + ((stack1 = alias5(((stack1 = (depth0 != null ? depth0.renderedCards : depth0)) != null ? stack1.card1 : stack1), depth0)) != null ? stack1 : "")
    + ((stack1 = alias5(((stack1 = (depth0 != null ? depth0.renderedCards : depth0)) != null ? stack1.card2 : stack1), depth0)) != null ? stack1 : "")
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.m || (depth0 != null ? depth0.m : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"m","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.preflop || (depth0 != null ? depth0.preflop : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"preflop","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.flop || (depth0 != null ? depth0.flop : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"flop","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.turn || (depth0 != null ? depth0.turn : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"turn","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.river || (depth0 != null ? depth0.river : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"river","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.showdown || (depth0 != null ? depth0.showdown : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"showdown","hash":{},"data":data}) : helper)))
    + "</td>\n      </tr>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, options, alias1=container.lambda, alias2=container.escapeExpression, alias3=depth0 != null ? depth0 : {}, alias4=helpers.helperMissing, alias5="function", alias6=helpers.blockHelperMissing, buffer = 
  "<div class=\"hhv-hand "
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.anyActivity : stack1), depth0))
    + " "
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.playerActivity : stack1), depth0))
    + "\">\n  <div class=\"hhv-header\">\n    <span class=\"hhv-bb-sb-ante-max\">\n      ("
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.bb : stack1), depth0))
    + "/"
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.sb : stack1), depth0))
    + ")\n"
    + ((stack1 = helpers["if"].call(alias3,((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.ante : stack1),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "      ["
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.table : depth0)) != null ? stack1.maxseats : stack1), depth0))
    + "]\n    </span>\n    <span class=\"hhv-board\">\n"
    + ((stack1 = helpers["if"].call(alias3,(depth0 != null ? depth0.renderedBoard : depth0),{"name":"if","hash":{},"fn":container.program(3, data, 0),"inverse":container.program(14, data, 0),"data":data})) != null ? stack1 : "")
    + "    </span>\n"
    + ((stack1 = helpers["if"].call(alias3,((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.day : stack1),{"name":"if","hash":{},"fn":container.program(16, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "    <span class=\"hhv-date\">\n      ";
  stack1 = ((helper = (helper = helpers.twodigits || (depth0 != null ? depth0.twodigits : depth0)) != null ? helper : alias4),(options={"name":"twodigits","hash":{},"fn":container.program(21, data, 0),"inverse":container.noop,"data":data}),(typeof helper === alias5 ? helper.call(alias3,options) : helper));
  if (!helpers.twodigits) { stack1 = alias6.call(depth0,stack1,options)}
  if (stack1 != null) { buffer += stack1; }
  buffer += ":";
  stack1 = ((helper = (helper = helpers.twodigits || (depth0 != null ? depth0.twodigits : depth0)) != null ? helper : alias4),(options={"name":"twodigits","hash":{},"fn":container.program(23, data, 0),"inverse":container.noop,"data":data}),(typeof helper === alias5 ? helper.call(alias3,options) : helper));
  if (!helpers.twodigits) { stack1 = alias6.call(depth0,stack1,options)}
  if (stack1 != null) { buffer += stack1; }
  buffer += ":";
  stack1 = ((helper = (helper = helpers.twodigits || (depth0 != null ? depth0.twodigits : depth0)) != null ? helper : alias4),(options={"name":"twodigits","hash":{},"fn":container.program(25, data, 0),"inverse":container.noop,"data":data}),(typeof helper === alias5 ? helper.call(alias3,options) : helper));
  if (!helpers.twodigits) { stack1 = alias6.call(depth0,stack1,options)}
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\n    </span>\n    <span class=\"hhv-gameinfo\">\n      "
    + ((stack1 = (helpers.ifvalue || (depth0 && depth0.ifvalue) || alias4).call(alias3,((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.gametype : stack1),{"name":"ifvalue","hash":{"value":"tournament"},"fn":container.program(27, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.gameno : stack1), depth0))
    + "\n      G: "
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.info : depth0)) != null ? stack1.handid : stack1), depth0))
    + "\n    </span>\n  </div>\n  <div class=\"hhv-table\">\n    <table>\n      <thead>\n      <tr>\n        <th>Pos</th>\n        <th>Name</th>\n        <th>Cards</th>\n        <th>M</th>\n        <th>Preflop</th>\n        <th>Flop</th>\n        <th>Turn</th>\n        <th>River</th>\n      </tr>\n      </thead>\n      <tbody>\n"
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.renderedPlayers : depth0),{"name":"each","hash":{},"fn":container.program(29, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "      </tbody>\n    </table>\n  </div>\n</div>\n";
},"useData":true});

},{"hbsfy/runtime":45}],48:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : {}, alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return ".hhv-hand {\n  display: none;\n}\n.hhv-player {\n  display: none;\n}\n.hhv-player"
    + alias4(((helper = (helper = helpers.players || (depth0 != null ? depth0.players : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"players","hash":{},"data":data}) : helper)))
    + " {\n  display: table-row;\n}\n.hhv-hand"
    + alias4(((helper = (helper = helpers.hand || (depth0 != null ? depth0.hand : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"hand","hash":{},"data":data}) : helper)))
    + " {\n  display: block;\n}\n";
},"useData":true});

},{"hbsfy/runtime":45}],49:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(container,depth0,helpers,partials,data) {
    var helper;

  return "tr."
    + container.escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : {},{"name":"name","hash":{},"data":data}) : helper)))
    + " {\n  background: rgba(210,255,82,1);\n  background: -moz-linear-gradient(top, rgba(210,255,82,1) 0%, rgba(145,232,66,1) 100%);\n  background: -webkit-gradient(left top, left bottom, color-stop(0%, rgba(210,255,82,1)), color-stop(100%, rgba(145,232,66,1)));\n  background: -webkit-linear-gradient(top, rgba(210,255,82,1) 0%, rgba(145,232,66,1) 100%);\n  background: -o-linear-gradient(top, rgba(210,255,82,1) 0%, rgba(145,232,66,1) 100%);\n  background: -ms-linear-gradient(top, rgba(210,255,82,1) 0%, rgba(145,232,66,1) 100%);\n  background: linear-gradient(to bottom, rgba(210,255,82,1) 0%, rgba(145,232,66,1) 100%);\n  filter: progid:DXImageTransform.Microsoft.gradient( startColorstr='#d2ff52', endColorstr='#91e842', GradientType=0 );\n}\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return ((stack1 = helpers["if"].call(depth0 != null ? depth0 : {},(depth0 != null ? depth0.selected : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "");
},"useData":true});

},{"hbsfy/runtime":45}],50:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return ".hhv-hand {\n  width: 700px;\n  background: #333;\n  border: 1px solid #333;\n  border-radius: 6px 6px 0 0;\n  box-shadow: 6px 6px 12px #888;\n  margin: 0 0 10px 0;\n}\n.hhv-header {\n  color: yellowgreen;\n  height: 20px;\n  padding: 2px;\n  font-family: monospace;\n}\n.hhv-board {\n  background: antiquewhite;\n  border-radius: 3px;\n  height: 20px;\n  color: black;\n  padding: 1px 0px 1px 2px;\n  margin-right: 3px;\n  min-width: 60px;\n}\n.hhv-card-value,\n.hhv-card-suit {\n  font-family: verdana;\n  font-size: 13px;\n}\n.hhv-card-suit {\n  margin-right: 2px;\n  font-size: 15px;\n}\n.hhv-card-suit.s,\n.hhv-card-suit.c {\n  color: black;\n}\n.hhv-card-suit.d,\n.hhv-card-suit.h {\n  color: red;\n}\n.hhv-table {\n  background: white;\n  font-family: Inconsolata, monospace;\n}\n.hhv-table table {\n  border-spacing: 0;\n}\n\n.hhv-table th {\n  text-align: left;\n  font-size: 13px;\n}\n\n.hhv-table td {\n  text-align: left;\n  padding: 0px 10px 0px 2px;\n  white-space: pre;\n  font-size: 13px;\n}\n.hhv-table .hhv-card-value,\n.hhv-table .hhv-card-suit {\n  font-size: 13px;\n}\n\n.hhv-table td:nth-child(1) { width: 10px; }\n.hhv-table td:nth-child(2) { width: 100px; }\n.hhv-table td:nth-child(3) { width: 30px; }\n.hhv-table td:nth-child(4) { width: 10px; text-align: right;}\n.hhv-table td:nth-child(5) { width: 100px; }\n.hhv-table td:nth-child(6) { width: 100px; }\n.hhv-table td:nth-child(7) { width: 100px; }\n.hhv-table td:nth-child(8) { width: 100px; }\n";
},"useData":true});

},{"hbsfy/runtime":45}],51:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : {}, alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "    <li>\n      <input type=\"radio\" name=\"players\" value=\""
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\""
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.isHero : depth0),{"name":"if","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "/>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\n    </li>\n";
},"2":function(container,depth0,helpers,partials,data) {
    return " checked";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "<div class=\"hhv-filter-players\">\n  <h3>Players</h3>\n  <ul>\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : {},(depth0 != null ? depth0.players : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </ul>\n</div>\n<div class=\"hhv-filter-show\">\n  <h3>Show</h3>\n  <ul>\n    <li><input type=\"radio\" name=\"show\" value=\"all\" checked/>All</li>\n    <li><input type=\"radio\" name=\"show\" value=\"invested\"/>Money Invested</li>\n    <li><input type=\"radio\" name=\"show\" value=\"sawFlop\"/>Saw Flop</li>\n  </ul>\n</div>\n<div class=\"hhv-filter-display\">\n  <h3>Display</h3>\n  <ul>\n    <li><input type=\"checkbox\" name=\"display\" value=\"selectPlayer\"/>Select Player</li>\n    <li><input type=\"checkbox\" name=\"display\" value=\"inactive\"/>Inactive Players</li>\n  </ul>\n</div>\n";
},"useData":true});

},{"hbsfy/runtime":45}],52:[function(require,module,exports){
module.exports={
  "info": {
    "room": "pokerstars",
    "handid": "149651992548",
    "gametype": "tournament",
    "gameno": "1495192630",
    "currency": "$",
    "donation": 0.91,
    "rake": 0.09,
    "buyin": 1,
    "pokertype": "holdem",
    "limit": "nolimit",
    "level": "xi ",
    "sb": 400,
    "bb": 800,
    "year": 2016,
    "month": 3,
    "day": 1,
    "hour": 1,
    "min": 29,
    "sec": 41,
    "timezone": "ET",
    "ante": 50,
    "players": 4,
    "anyInvested": true,
    "anySawFlop": true
  },
  "table": {
    "tableno": 3,
    "maxseats": 9,
    "button": 3
  },
  "board": {
    "card1": "3c",
    "card2": "Jc",
    "card3": "3h",
    "card4": "6h",
    "card5": "3d"
  },
  "players": [
    {
      "seatno": 4,
      "chips": 15451,
      "chipsPreflop": 15001,
      "chipsFlop": 15001,
      "chipsTurn": 15001,
      "chipsRiver": 15001,
      "chipsShowdown": 15001,
      "chipsAfter": 15001,
      "m": 11,
      "preflop": [
        {
          "type": "fold",
          "pot": 4600
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [],
      "sb": true,
      "preflopOrder": 2,
      "postflopOrder": 0,
      "pos": "sb",
      "name": "DmelloH",
      "invested": true,
      "sawFlop": false
    },
    {
      "seatno": 9,
      "chips": 22060,
      "chipsPreflop": 21210,
      "chipsFlop": 21210,
      "chipsTurn": 21210,
      "chipsRiver": 21210,
      "chipsShowdown": 21210,
      "chipsAfter": 21210,
      "m": 16,
      "preflop": [
        {
          "type": "fold",
          "pot": 4600
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [],
      "hero": true,
      "cards": {
        "card1": "4c",
        "card2": "2d"
      },
      "bb": true,
      "preflopOrder": 3,
      "postflopOrder": 1,
      "pos": "bb",
      "name": "held",
      "invested": true,
      "sawFlop": false
    },
    {
      "seatno": 1,
      "chips": 15875,
      "chipsPreflop": 15825,
      "chipsFlop": 14225,
      "chipsTurn": 11825,
      "chipsRiver": 10225,
      "chipsShowdown": 7025,
      "chipsAfter": 7025,
      "m": 11,
      "preflop": [
        {
          "type": "raise",
          "ratio": 2,
          "allin": false,
          "amount": 1600,
          "pot": 1400
        }
      ],
      "flop": [
        {
          "type": "bet",
          "ratio": 0.5,
          "allin": false,
          "amount": 2400,
          "pot": 4600
        }
      ],
      "turn": [
        {
          "type": "check",
          "pot": 9400
        },
        {
          "type": "call",
          "ratio": 0.1,
          "allin": false,
          "amount": 1600,
          "pot": 11000
        }
      ],
      "river": [
        {
          "type": "check",
          "pot": 12600
        },
        {
          "type": "call",
          "ratio": 0.2,
          "allin": false,
          "amount": 3200,
          "pot": 15800
        }
      ],
      "showdown": [],
      "preflopOrder": 0,
      "postflopOrder": 2,
      "pos": "co",
      "cards": {
        "card1": "Td",
        "card2": "Tc"
      },
      "name": "Fischersito",
      "invested": true,
      "sawFlop": true
    },
    {
      "seatno": 3,
      "chips": 14114,
      "chipsPreflop": 14064,
      "chipsFlop": 12464,
      "chipsTurn": 10064,
      "chipsRiver": 8464,
      "chipsShowdown": 5264,
      "chipsAfter": 24264,
      "m": 10,
      "preflop": [
        {
          "type": "call",
          "ratio": 0.5,
          "allin": false,
          "amount": 1600,
          "pot": 3000
        }
      ],
      "flop": [
        {
          "type": "call",
          "ratio": 0.3,
          "allin": false,
          "amount": 2400,
          "pot": 7000
        }
      ],
      "turn": [
        {
          "type": "bet",
          "ratio": 0.2,
          "allin": false,
          "amount": 1600,
          "pot": 9400
        }
      ],
      "river": [
        {
          "type": "bet",
          "ratio": 0.3,
          "allin": false,
          "amount": 3200,
          "pot": 12600
        }
      ],
      "showdown": [
        {
          "type": "collect",
          "ratio": 1,
          "winall": true,
          "amount": 19000
        }
      ],
      "button": true,
      "preflopOrder": 1,
      "postflopOrder": 3,
      "pos": "bu",
      "cards": {
        "card1": "Qs",
        "card2": "Jh"
      },
      "name": "Irisha2",
      "invested": true,
      "sawFlop": true
    }
  ]
}
},{}],53:[function(require,module,exports){
module.exports={
  "info": {
    "room": "pokerstars",
    "handid": "149652059422",
    "gametype": "tournament",
    "gameno": "1495192630",
    "currency": "$",
    "donation": 0.91,
    "rake": 0.09,
    "buyin": 1,
    "pokertype": "holdem",
    "limit": "nolimit",
    "level": "xi ",
    "sb": 400,
    "bb": 800,
    "year": 2016,
    "month": 3,
    "day": 1,
    "hour": 1,
    "min": 33,
    "sec": 54,
    "timezone": "ET",
    "ante": 50,
    "players": 4,
    "anyInvested": true,
    "anySawFlop": false
  },
  "table": {
    "tableno": 3,
    "maxseats": 9,
    "button": 3
  },
  "board": {
    "card1": "8h",
    "card2": "Kd",
    "card3": "2s",
    "card4": "6s",
    "card5": "4s"
  },
  "players": [
    {
      "seatno": 4,
      "chips": 33302,
      "chipsPreflop": 32852,
      "chipsFlop": 26893,
      "chipsTurn": 26893,
      "chipsRiver": 26893,
      "chipsShowdown": 26893,
      "chipsAfter": 26893,
      "m": 24,
      "preflop": [
        {
          "type": "call",
          "ratio": 0.6,
          "allin": false,
          "amount": 3025,
          "pot": 4825
        },
        {
          "type": "call",
          "ratio": 0.2,
          "allin": false,
          "amount": 2934,
          "pot": 14209
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [],
      "sb": true,
      "preflopOrder": 2,
      "postflopOrder": 0,
      "pos": "sb",
      "cards": {
        "card1": "7h",
        "card2": "7d"
      },
      "name": "DmelloH",
      "invested": true,
      "sawFlop": false
    },
    {
      "seatno": 9,
      "chips": 6409,
      "chipsPreflop": 5559,
      "chipsFlop": 0,
      "chipsTurn": 0,
      "chipsRiver": 0,
      "chipsShowdown": 0,
      "chipsAfter": 16343,
      "m": 5,
      "preflop": [
        {
          "type": "raise",
          "ratio": 1.9,
          "allin": true,
          "amount": 5559,
          "pot": 7850
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [
        {
          "type": "collect",
          "ratio": 1,
          "winall": true,
          "amount": 16343
        }
      ],
      "hero": true,
      "cards": {
        "card1": "Qd",
        "card2": "Qs"
      },
      "bb": true,
      "preflopOrder": 3,
      "postflopOrder": 1,
      "pos": "bb",
      "name": "held",
      "invested": true,
      "sawFlop": false
    },
    {
      "seatno": 1,
      "chips": 3475,
      "chipsPreflop": 3425,
      "chipsFlop": 0,
      "chipsTurn": 0,
      "chipsRiver": 0,
      "chipsShowdown": 0,
      "chipsAfter": 0,
      "m": 2,
      "preflop": [
        {
          "type": "raise",
          "ratio": 4.3,
          "allin": true,
          "amount": 3425,
          "pot": 1400
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [],
      "preflopOrder": 0,
      "postflopOrder": 2,
      "pos": "co",
      "cards": {
        "card1": "Ad",
        "card2": "2c"
      },
      "name": "Fischersito",
      "invested": true,
      "sawFlop": false
    },
    {
      "seatno": 3,
      "chips": 24314,
      "chipsPreflop": 24264,
      "chipsFlop": 24264,
      "chipsTurn": 24264,
      "chipsRiver": 24264,
      "chipsShowdown": 24264,
      "chipsAfter": 24264,
      "m": 17,
      "preflop": [
        {
          "type": "fold",
          "pot": 4825
        }
      ],
      "flop": [],
      "turn": [],
      "river": [],
      "showdown": [],
      "button": true,
      "preflopOrder": 1,
      "postflopOrder": 3,
      "pos": "bu",
      "name": "Irisha2",
      "invested": false,
      "sawFlop": false
    }
  ]
}
},{}]},{},[13])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9oaGEvaGhhLmpzIiwiLi4vaGhhL2xpYi9ob2xkZW0uanMiLCIuLi9oaGEvbGliL3NjcmlwdC5qcyIsIi4uL2hoYS9saWIvc3Rvcnlib2FyZC5qcyIsIi4uL2hoYS9saWIvc3RyYXRlZ2ljLXBvc2l0aW9ucy5qcyIsIi4uL2hoYS9saWIvc3VtbWFyeS5qcyIsIi4uL2hocC9oaHAuanMiLCIuLi9oaHAvbGliL2hvbGRlbS9iYXNlLmpzIiwiLi4vaGhwL2xpYi9ob2xkZW0vaWduaXRpb24uanMiLCIuLi9oaHAvbGliL2hvbGRlbS9wb2tlcnN0YXJzLmpzIiwiLi4vaGhwL2xpYi91dGlsL3N0cmluZy5qcyIsIi4uL2hocC9saWIvdXRpbC90d2Vha3MuanMiLCJjbGllbnQvbWFpbi5qcyIsImNsaWVudC9zYW1wbGUuanMiLCJoaHYuanMiLCJsaWIvYnJvd3Nlci10ZW1wbGF0ZXMuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi9pbmplY3Qtc3R5bGUuanMiLCJsaWIvc29ydC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L2xpYi9fZW1wdHkuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMucnVudGltZS5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2Jhc2UuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9kZWNvcmF0b3JzLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvZGVjb3JhdG9ycy9pbmxpbmUuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9leGNlcHRpb24uanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9ibG9jay1oZWxwZXItbWlzc2luZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvZWFjaC5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvaGVscGVyLW1pc3NpbmcuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2lmLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9sb2cuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2xvb2t1cC5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvd2l0aC5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2xvZ2dlci5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvbm8tY29uZmxpY3QuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9ydW50aW1lLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvc2FmZS1zdHJpbmcuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy91dGlscy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL3J1bnRpbWUuanMiLCJub2RlX21vZHVsZXMvaGJzZnkvcnVudGltZS5qcyIsInRlbXBsYXRlcy9oZWFkLmhicyIsInRlbXBsYXRlcy9ob2xkZW0uaGJzIiwidGVtcGxhdGVzL3N0eWxlLWZpbHRlci5oYnMiLCJ0ZW1wbGF0ZXMvc3R5bGUtc2VsZWN0LXBsYXllci5oYnMiLCJ0ZW1wbGF0ZXMvc3R5bGUuaGJzIiwidGVtcGxhdGVzL3VpLWZpbHRlci5oYnMiLCJ0ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uIiwidGVzdC9maXh0dXJlcy9ob2xkZW0vYWxsaW4tcHJlZmxvcC5qc29uIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMVlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMveEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BtQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7OEJDMWtCc0IsbUJBQW1COztJQUE3QixJQUFJOzs7OztvQ0FJTywwQkFBMEI7Ozs7bUNBQzNCLHdCQUF3Qjs7OzsrQkFDdkIsb0JBQW9COztJQUEvQixLQUFLOztpQ0FDUSxzQkFBc0I7O0lBQW5DLE9BQU87O29DQUVJLDBCQUEwQjs7Ozs7QUFHakQsU0FBUyxNQUFNLEdBQUc7QUFDaEIsTUFBSSxFQUFFLEdBQUcsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQzs7QUFFMUMsT0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkIsSUFBRSxDQUFDLFVBQVUsb0NBQWEsQ0FBQztBQUMzQixJQUFFLENBQUMsU0FBUyxtQ0FBWSxDQUFDO0FBQ3pCLElBQUUsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQ2pCLElBQUUsQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUM7O0FBRTdDLElBQUUsQ0FBQyxFQUFFLEdBQUcsT0FBTyxDQUFDO0FBQ2hCLElBQUUsQ0FBQyxRQUFRLEdBQUcsVUFBUyxJQUFJLEVBQUU7QUFDM0IsV0FBTyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztHQUNuQyxDQUFDOztBQUVGLFNBQU8sRUFBRSxDQUFDO0NBQ1g7O0FBRUQsSUFBSSxJQUFJLEdBQUcsTUFBTSxFQUFFLENBQUM7QUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7O0FBRXJCLGtDQUFXLElBQUksQ0FBQyxDQUFDOztBQUVqQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDOztxQkFFUixJQUFJOzs7Ozs7Ozs7Ozs7O3FCQ3BDeUIsU0FBUzs7eUJBQy9CLGFBQWE7Ozs7dUJBQ0UsV0FBVzs7MEJBQ1IsY0FBYzs7c0JBQ25DLFVBQVU7Ozs7QUFFdEIsSUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDOztBQUN4QixJQUFNLGlCQUFpQixHQUFHLENBQUMsQ0FBQzs7O0FBRTVCLElBQU0sZ0JBQWdCLEdBQUc7QUFDOUIsR0FBQyxFQUFFLGFBQWE7QUFDaEIsR0FBQyxFQUFFLGVBQWU7QUFDbEIsR0FBQyxFQUFFLGVBQWU7QUFDbEIsR0FBQyxFQUFFLFVBQVU7QUFDYixHQUFDLEVBQUUsa0JBQWtCO0FBQ3JCLEdBQUMsRUFBRSxpQkFBaUI7QUFDcEIsR0FBQyxFQUFFLFVBQVU7Q0FDZCxDQUFDOzs7QUFFRixJQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQzs7QUFFOUIsU0FBUyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRTtBQUNuRSxNQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sSUFBSSxFQUFFLENBQUM7QUFDN0IsTUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLElBQUksRUFBRSxDQUFDO0FBQy9CLE1BQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxJQUFJLEVBQUUsQ0FBQzs7QUFFbkMsa0NBQXVCLElBQUksQ0FBQyxDQUFDO0FBQzdCLHdDQUEwQixJQUFJLENBQUMsQ0FBQztDQUNqQzs7QUFFRCxxQkFBcUIsQ0FBQyxTQUFTLEdBQUc7QUFDaEMsYUFBVyxFQUFFLHFCQUFxQjs7QUFFbEMsUUFBTSxxQkFBUTtBQUNkLEtBQUcsRUFBRSxvQkFBTyxHQUFHOztBQUVmLGdCQUFjLEVBQUUsd0JBQVMsSUFBSSxFQUFFLEVBQUUsRUFBRTtBQUNqQyxRQUFJLGdCQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxVQUFVLEVBQUU7QUFDdEMsVUFBSSxFQUFFLEVBQUU7QUFBRSxjQUFNLDJCQUFjLHlDQUF5QyxDQUFDLENBQUM7T0FBRTtBQUMzRSxvQkFBTyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0tBQzVCLE1BQU07QUFDTCxVQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztLQUN6QjtHQUNGO0FBQ0Qsa0JBQWdCLEVBQUUsMEJBQVMsSUFBSSxFQUFFO0FBQy9CLFdBQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztHQUMzQjs7QUFFRCxpQkFBZSxFQUFFLHlCQUFTLElBQUksRUFBRSxPQUFPLEVBQUU7QUFDdkMsUUFBSSxnQkFBUyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssVUFBVSxFQUFFO0FBQ3RDLG9CQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7S0FDN0IsTUFBTTtBQUNMLFVBQUksT0FBTyxPQUFPLEtBQUssV0FBVyxFQUFFO0FBQ2xDLGNBQU0seUVBQTBELElBQUksb0JBQWlCLENBQUM7T0FDdkY7QUFDRCxVQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQztLQUMvQjtHQUNGO0FBQ0QsbUJBQWlCLEVBQUUsMkJBQVMsSUFBSSxFQUFFO0FBQ2hDLFdBQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztHQUM1Qjs7QUFFRCxtQkFBaUIsRUFBRSwyQkFBUyxJQUFJLEVBQUUsRUFBRSxFQUFFO0FBQ3BDLFFBQUksZ0JBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLFVBQVUsRUFBRTtBQUN0QyxVQUFJLEVBQUUsRUFBRTtBQUFFLGNBQU0sMkJBQWMsNENBQTRDLENBQUMsQ0FBQztPQUFFO0FBQzlFLG9CQUFPLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7S0FDL0IsTUFBTTtBQUNMLFVBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0tBQzVCO0dBQ0Y7QUFDRCxxQkFBbUIsRUFBRSw2QkFBUyxJQUFJLEVBQUU7QUFDbEMsV0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0dBQzlCO0NBQ0YsQ0FBQzs7QUFFSyxJQUFJLEdBQUcsR0FBRyxvQkFBTyxHQUFHLENBQUM7OztRQUVwQixXQUFXO1FBQUUsTUFBTTs7Ozs7Ozs7Ozs7O2dDQzdFQSxxQkFBcUI7Ozs7QUFFekMsU0FBUyx5QkFBeUIsQ0FBQyxRQUFRLEVBQUU7QUFDbEQsZ0NBQWUsUUFBUSxDQUFDLENBQUM7Q0FDMUI7Ozs7Ozs7O3FCQ0pvQixVQUFVOztxQkFFaEIsVUFBUyxRQUFRLEVBQUU7QUFDaEMsVUFBUSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxVQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRTtBQUMzRSxRQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFDYixRQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRTtBQUNuQixXQUFLLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUNwQixTQUFHLEdBQUcsVUFBUyxPQUFPLEVBQUUsT0FBTyxFQUFFOztBQUUvQixZQUFJLFFBQVEsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDO0FBQ2xDLGlCQUFTLENBQUMsUUFBUSxHQUFHLGNBQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDMUQsWUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUMvQixpQkFBUyxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7QUFDOUIsZUFBTyxHQUFHLENBQUM7T0FDWixDQUFDO0tBQ0g7O0FBRUQsU0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQzs7QUFFN0MsV0FBTyxHQUFHLENBQUM7R0FDWixDQUFDLENBQUM7Q0FDSjs7Ozs7Ozs7OztBQ3BCRCxJQUFNLFVBQVUsR0FBRyxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDOztBQUVuRyxTQUFTLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQ2hDLE1BQUksR0FBRyxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsR0FBRztNQUN0QixJQUFJLFlBQUE7TUFDSixNQUFNLFlBQUEsQ0FBQztBQUNYLE1BQUksR0FBRyxFQUFFO0FBQ1AsUUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQ3RCLFVBQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQzs7QUFFMUIsV0FBTyxJQUFJLEtBQUssR0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLE1BQU0sQ0FBQztHQUN4Qzs7QUFFRCxNQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDOzs7QUFHMUQsT0FBSyxJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFDaEQsUUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztHQUM5Qzs7O0FBR0QsTUFBSSxLQUFLLENBQUMsaUJBQWlCLEVBQUU7QUFDM0IsU0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztHQUMxQzs7QUFFRCxNQUFJLEdBQUcsRUFBRTtBQUNQLFFBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO0FBQ3ZCLFFBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0dBQ3RCO0NBQ0Y7O0FBRUQsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDOztxQkFFbkIsU0FBUzs7Ozs7Ozs7Ozs7Ozt5Q0NsQ2UsZ0NBQWdDOzs7OzJCQUM5QyxnQkFBZ0I7Ozs7b0NBQ1AsMEJBQTBCOzs7O3lCQUNyQyxjQUFjOzs7OzBCQUNiLGVBQWU7Ozs7NkJBQ1osa0JBQWtCOzs7OzJCQUNwQixnQkFBZ0I7Ozs7QUFFbEMsU0FBUyxzQkFBc0IsQ0FBQyxRQUFRLEVBQUU7QUFDL0MseUNBQTJCLFFBQVEsQ0FBQyxDQUFDO0FBQ3JDLDJCQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZCLG9DQUFzQixRQUFRLENBQUMsQ0FBQztBQUNoQyx5QkFBVyxRQUFRLENBQUMsQ0FBQztBQUNyQiwwQkFBWSxRQUFRLENBQUMsQ0FBQztBQUN0Qiw2QkFBZSxRQUFRLENBQUMsQ0FBQztBQUN6QiwyQkFBYSxRQUFRLENBQUMsQ0FBQztDQUN4Qjs7Ozs7Ozs7cUJDaEJxRCxVQUFVOztxQkFFakQsVUFBUyxRQUFRLEVBQUU7QUFDaEMsVUFBUSxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxVQUFTLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDdkUsUUFBSSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU87UUFDekIsRUFBRSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7O0FBRXBCLFFBQUksT0FBTyxLQUFLLElBQUksRUFBRTtBQUNwQixhQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNqQixNQUFNLElBQUksT0FBTyxLQUFLLEtBQUssSUFBSSxPQUFPLElBQUksSUFBSSxFQUFFO0FBQy9DLGFBQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3RCLE1BQU0sSUFBSSxlQUFRLE9BQU8sQ0FBQyxFQUFFO0FBQzNCLFVBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDdEIsWUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQ2YsaUJBQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDOUI7O0FBRUQsZUFBTyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7T0FDaEQsTUFBTTtBQUNMLGVBQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO09BQ3RCO0tBQ0YsTUFBTTtBQUNMLFVBQUksT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQy9CLFlBQUksSUFBSSxHQUFHLG1CQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyQyxZQUFJLENBQUMsV0FBVyxHQUFHLHlCQUFrQixPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDN0UsZUFBTyxHQUFHLEVBQUMsSUFBSSxFQUFFLElBQUksRUFBQyxDQUFDO09BQ3hCOztBQUVELGFBQU8sRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUM3QjtHQUNGLENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7Ozs7O3FCQy9COEUsVUFBVTs7eUJBQ25FLGNBQWM7Ozs7cUJBRXJCLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLFVBQVMsT0FBTyxFQUFFLE9BQU8sRUFBRTtBQUN6RCxRQUFJLENBQUMsT0FBTyxFQUFFO0FBQ1osWUFBTSwyQkFBYyw2QkFBNkIsQ0FBQyxDQUFDO0tBQ3BEOztBQUVELFFBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxFQUFFO1FBQ2YsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPO1FBQ3pCLENBQUMsR0FBRyxDQUFDO1FBQ0wsR0FBRyxHQUFHLEVBQUU7UUFDUixJQUFJLFlBQUE7UUFDSixXQUFXLFlBQUEsQ0FBQzs7QUFFaEIsUUFBSSxPQUFPLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUU7QUFDL0IsaUJBQVcsR0FBRyx5QkFBa0IsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztLQUNqRjs7QUFFRCxRQUFJLGtCQUFXLE9BQU8sQ0FBQyxFQUFFO0FBQUUsYUFBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7S0FBRTs7QUFFMUQsUUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFO0FBQ2hCLFVBQUksR0FBRyxtQkFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDbEM7O0FBRUQsYUFBUyxhQUFhLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDekMsVUFBSSxJQUFJLEVBQUU7QUFDUixZQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQztBQUNqQixZQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztBQUNuQixZQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDekIsWUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDOztBQUVuQixZQUFJLFdBQVcsRUFBRTtBQUNmLGNBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxHQUFHLEtBQUssQ0FBQztTQUN4QztPQUNGOztBQUVELFNBQUcsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUM3QixZQUFJLEVBQUUsSUFBSTtBQUNWLG1CQUFXLEVBQUUsbUJBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO09BQy9FLENBQUMsQ0FBQztLQUNKOztBQUVELFFBQUksT0FBTyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRTtBQUMxQyxVQUFJLGVBQVEsT0FBTyxDQUFDLEVBQUU7QUFDcEIsYUFBSyxJQUFJLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDdkMsY0FBSSxDQUFDLElBQUksT0FBTyxFQUFFO0FBQ2hCLHlCQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztXQUMvQztTQUNGO09BQ0YsTUFBTTtBQUNMLFlBQUksUUFBUSxZQUFBLENBQUM7O0FBRWIsYUFBSyxJQUFJLEdBQUcsSUFBSSxPQUFPLEVBQUU7QUFDdkIsY0FBSSxPQUFPLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFOzs7O0FBSS9CLGdCQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUU7QUFDMUIsMkJBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQ2hDO0FBQ0Qsb0JBQVEsR0FBRyxHQUFHLENBQUM7QUFDZixhQUFDLEVBQUUsQ0FBQztXQUNMO1NBQ0Y7QUFDRCxZQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUU7QUFDMUIsdUJBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztTQUN0QztPQUNGO0tBQ0Y7O0FBRUQsUUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO0FBQ1gsU0FBRyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNyQjs7QUFFRCxXQUFPLEdBQUcsQ0FBQztHQUNaLENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7Ozs7O3lCQzlFcUIsY0FBYzs7OztxQkFFckIsVUFBUyxRQUFRLEVBQUU7QUFDaEMsVUFBUSxDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsaUNBQWdDO0FBQ3ZFLFFBQUksU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7O0FBRTFCLGFBQU8sU0FBUyxDQUFDO0tBQ2xCLE1BQU07O0FBRUwsWUFBTSwyQkFBYyxtQkFBbUIsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7S0FDdkY7R0FDRixDQUFDLENBQUM7Q0FDSjs7Ozs7Ozs7OztxQkNaaUMsVUFBVTs7cUJBRTdCLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFVBQVMsV0FBVyxFQUFFLE9BQU8sRUFBRTtBQUMzRCxRQUFJLGtCQUFXLFdBQVcsQ0FBQyxFQUFFO0FBQUUsaUJBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQUU7Ozs7O0FBS3RFLFFBQUksQUFBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsV0FBVyxJQUFLLGVBQVEsV0FBVyxDQUFDLEVBQUU7QUFDdkUsYUFBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlCLE1BQU07QUFDTCxhQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDekI7R0FDRixDQUFDLENBQUM7O0FBRUgsVUFBUSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsVUFBUyxXQUFXLEVBQUUsT0FBTyxFQUFFO0FBQy9ELFdBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxFQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQztHQUN2SCxDQUFDLENBQUM7Q0FDSjs7Ozs7Ozs7OztxQkNuQmMsVUFBUyxRQUFRLEVBQUU7QUFDaEMsVUFBUSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsa0NBQWlDO0FBQzlELFFBQUksSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDO1FBQ2xCLE9BQU8sR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM5QyxTQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsVUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN6Qjs7QUFFRCxRQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDZCxRQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksRUFBRTtBQUM5QixXQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7S0FDNUIsTUFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxFQUFFO0FBQ3JELFdBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztLQUM1QjtBQUNELFFBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7O0FBRWhCLFlBQVEsQ0FBQyxHQUFHLE1BQUEsQ0FBWixRQUFRLEVBQVMsSUFBSSxDQUFDLENBQUM7R0FDeEIsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7cUJDbEJjLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLFVBQVMsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUNyRCxXQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7R0FDMUIsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7cUJDSjhFLFVBQVU7O3FCQUUxRSxVQUFTLFFBQVEsRUFBRTtBQUNoQyxVQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxVQUFTLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDekQsUUFBSSxrQkFBVyxPQUFPLENBQUMsRUFBRTtBQUFFLGFBQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQUU7O0FBRTFELFFBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7O0FBRXBCLFFBQUksQ0FBQyxlQUFRLE9BQU8sQ0FBQyxFQUFFO0FBQ3JCLFVBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFDeEIsVUFBSSxPQUFPLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUU7QUFDL0IsWUFBSSxHQUFHLG1CQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxZQUFJLENBQUMsV0FBVyxHQUFHLHlCQUFrQixPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7T0FDaEY7O0FBRUQsYUFBTyxFQUFFLENBQUMsT0FBTyxFQUFFO0FBQ2pCLFlBQUksRUFBRSxJQUFJO0FBQ1YsbUJBQVcsRUFBRSxtQkFBWSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztPQUNoRSxDQUFDLENBQUM7S0FDSixNQUFNO0FBQ0wsYUFBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlCO0dBQ0YsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7cUJDdkJxQixTQUFTOztBQUUvQixJQUFJLE1BQU0sR0FBRztBQUNYLFdBQVMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQztBQUM3QyxPQUFLLEVBQUUsTUFBTTs7O0FBR2IsYUFBVyxFQUFFLHFCQUFTLEtBQUssRUFBRTtBQUMzQixRQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRTtBQUM3QixVQUFJLFFBQVEsR0FBRyxlQUFRLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFDOUQsVUFBSSxRQUFRLElBQUksQ0FBQyxFQUFFO0FBQ2pCLGFBQUssR0FBRyxRQUFRLENBQUM7T0FDbEIsTUFBTTtBQUNMLGFBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO09BQzdCO0tBQ0Y7O0FBRUQsV0FBTyxLQUFLLENBQUM7R0FDZDs7O0FBR0QsS0FBRyxFQUFFLGFBQVMsS0FBSyxFQUFjO0FBQy9CLFNBQUssR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDOztBQUVsQyxRQUFJLE9BQU8sT0FBTyxLQUFLLFdBQVcsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLEVBQUU7QUFDL0UsVUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxVQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFOztBQUNwQixjQUFNLEdBQUcsS0FBSyxDQUFDO09BQ2hCOzt3Q0FQbUIsT0FBTztBQUFQLGVBQU87OztBQVEzQixhQUFPLENBQUMsTUFBTSxPQUFDLENBQWYsT0FBTyxFQUFZLE9BQU8sQ0FBQyxDQUFDO0tBQzdCO0dBQ0Y7Q0FDRixDQUFDOztxQkFFYSxNQUFNOzs7Ozs7Ozs7OztxQkNqQ04sVUFBUyxVQUFVLEVBQUU7O0FBRWxDLE1BQUksSUFBSSxHQUFHLE9BQU8sTUFBTSxLQUFLLFdBQVcsR0FBRyxNQUFNLEdBQUcsTUFBTTtNQUN0RCxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQzs7QUFFbEMsWUFBVSxDQUFDLFVBQVUsR0FBRyxZQUFXO0FBQ2pDLFFBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxVQUFVLEVBQUU7QUFDbEMsVUFBSSxDQUFDLFVBQVUsR0FBRyxXQUFXLENBQUM7S0FDL0I7QUFDRCxXQUFPLFVBQVUsQ0FBQztHQUNuQixDQUFDO0NBQ0g7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7cUJDWnNCLFNBQVM7O0lBQXBCLEtBQUs7O3lCQUNLLGFBQWE7Ozs7b0JBQzhCLFFBQVE7O0FBRWxFLFNBQVMsYUFBYSxDQUFDLFlBQVksRUFBRTtBQUMxQyxNQUFNLGdCQUFnQixHQUFHLFlBQVksSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztNQUN2RCxlQUFlLDBCQUFvQixDQUFDOztBQUUxQyxNQUFJLGdCQUFnQixLQUFLLGVBQWUsRUFBRTtBQUN4QyxRQUFJLGdCQUFnQixHQUFHLGVBQWUsRUFBRTtBQUN0QyxVQUFNLGVBQWUsR0FBRyx1QkFBaUIsZUFBZSxDQUFDO1VBQ25ELGdCQUFnQixHQUFHLHVCQUFpQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQzVELFlBQU0sMkJBQWMseUZBQXlGLEdBQ3ZHLHFEQUFxRCxHQUFHLGVBQWUsR0FBRyxtREFBbUQsR0FBRyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsQ0FBQztLQUNoSyxNQUFNOztBQUVMLFlBQU0sMkJBQWMsd0ZBQXdGLEdBQ3RHLGlEQUFpRCxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztLQUNuRjtHQUNGO0NBQ0Y7O0FBRU0sU0FBUyxRQUFRLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTs7QUFFMUMsTUFBSSxDQUFDLEdBQUcsRUFBRTtBQUNSLFVBQU0sMkJBQWMsbUNBQW1DLENBQUMsQ0FBQztHQUMxRDtBQUNELE1BQUksQ0FBQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFO0FBQ3ZDLFVBQU0sMkJBQWMsMkJBQTJCLEdBQUcsT0FBTyxZQUFZLENBQUMsQ0FBQztHQUN4RTs7QUFFRCxjQUFZLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDOzs7O0FBSWxELEtBQUcsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQzs7QUFFNUMsV0FBUyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtBQUN2RCxRQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUU7QUFDaEIsYUFBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbEQsVUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQ2YsZUFBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7T0FDdkI7S0FDRjs7QUFFRCxXQUFPLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3RFLFFBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQzs7QUFFeEUsUUFBSSxNQUFNLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQyxPQUFPLEVBQUU7QUFDakMsYUFBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN6RixZQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQzNEO0FBQ0QsUUFBSSxNQUFNLElBQUksSUFBSSxFQUFFO0FBQ2xCLFVBQUksT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUNsQixZQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9CLGFBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDNUMsY0FBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUM1QixrQkFBTTtXQUNQOztBQUVELGVBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN0QztBQUNELGNBQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO09BQzNCO0FBQ0QsYUFBTyxNQUFNLENBQUM7S0FDZixNQUFNO0FBQ0wsWUFBTSwyQkFBYyxjQUFjLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRywwREFBMEQsQ0FBQyxDQUFDO0tBQ2pIO0dBQ0Y7OztBQUdELE1BQUksU0FBUyxHQUFHO0FBQ2QsVUFBTSxFQUFFLGdCQUFTLEdBQUcsRUFBRSxJQUFJLEVBQUU7QUFDMUIsVUFBSSxFQUFFLElBQUksSUFBSSxHQUFHLENBQUEsQUFBQyxFQUFFO0FBQ2xCLGNBQU0sMkJBQWMsR0FBRyxHQUFHLElBQUksR0FBRyxtQkFBbUIsR0FBRyxHQUFHLENBQUMsQ0FBQztPQUM3RDtBQUNELGFBQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2xCO0FBQ0QsVUFBTSxFQUFFLGdCQUFTLE1BQU0sRUFBRSxJQUFJLEVBQUU7QUFDN0IsVUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUMxQixXQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzVCLFlBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFDeEMsaUJBQU8sTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3hCO09BQ0Y7S0FDRjtBQUNELFVBQU0sRUFBRSxnQkFBUyxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQ2pDLGFBQU8sT0FBTyxPQUFPLEtBQUssVUFBVSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsT0FBTyxDQUFDO0tBQ3hFOztBQUVELG9CQUFnQixFQUFFLEtBQUssQ0FBQyxnQkFBZ0I7QUFDeEMsaUJBQWEsRUFBRSxvQkFBb0I7O0FBRW5DLE1BQUUsRUFBRSxZQUFTLENBQUMsRUFBRTtBQUNkLFVBQUksR0FBRyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxQixTQUFHLENBQUMsU0FBUyxHQUFHLFlBQVksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDdkMsYUFBTyxHQUFHLENBQUM7S0FDWjs7QUFFRCxZQUFRLEVBQUUsRUFBRTtBQUNaLFdBQU8sRUFBRSxpQkFBUyxDQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUU7QUFDbkUsVUFBSSxjQUFjLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7VUFDakMsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsVUFBSSxJQUFJLElBQUksTUFBTSxJQUFJLFdBQVcsSUFBSSxtQkFBbUIsRUFBRTtBQUN4RCxzQkFBYyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO09BQzNGLE1BQU0sSUFBSSxDQUFDLGNBQWMsRUFBRTtBQUMxQixzQkFBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7T0FDOUQ7QUFDRCxhQUFPLGNBQWMsQ0FBQztLQUN2Qjs7QUFFRCxRQUFJLEVBQUUsY0FBUyxLQUFLLEVBQUUsS0FBSyxFQUFFO0FBQzNCLGFBQU8sS0FBSyxJQUFJLEtBQUssRUFBRSxFQUFFO0FBQ3ZCLGFBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDO09BQ3ZCO0FBQ0QsYUFBTyxLQUFLLENBQUM7S0FDZDtBQUNELFNBQUssRUFBRSxlQUFTLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDN0IsVUFBSSxHQUFHLEdBQUcsS0FBSyxJQUFJLE1BQU0sQ0FBQzs7QUFFMUIsVUFBSSxLQUFLLElBQUksTUFBTSxJQUFLLEtBQUssS0FBSyxNQUFNLEFBQUMsRUFBRTtBQUN6QyxXQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO09BQ3ZDOztBQUVELGFBQU8sR0FBRyxDQUFDO0tBQ1o7O0FBRUQsUUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSTtBQUNqQixnQkFBWSxFQUFFLFlBQVksQ0FBQyxRQUFRO0dBQ3BDLENBQUM7O0FBRUYsV0FBUyxHQUFHLENBQUMsT0FBTyxFQUFnQjtRQUFkLE9BQU8seURBQUcsRUFBRTs7QUFDaEMsUUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQzs7QUFFeEIsT0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNwQixRQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFO0FBQzVDLFVBQUksR0FBRyxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0tBQ2hDO0FBQ0QsUUFBSSxNQUFNLFlBQUE7UUFDTixXQUFXLEdBQUcsWUFBWSxDQUFDLGNBQWMsR0FBRyxFQUFFLEdBQUcsU0FBUyxDQUFDO0FBQy9ELFFBQUksWUFBWSxDQUFDLFNBQVMsRUFBRTtBQUMxQixVQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUU7QUFDbEIsY0FBTSxHQUFHLE9BQU8sS0FBSyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO09BQzVGLE1BQU07QUFDTCxjQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztPQUNwQjtLQUNGOztBQUVELGFBQVMsSUFBSSxDQUFDLE9BQU8sZ0JBQWU7QUFDbEMsYUFBTyxFQUFFLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLFNBQVMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0tBQ3JIO0FBQ0QsUUFBSSxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDdEcsV0FBTyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0dBQy9CO0FBQ0QsS0FBRyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7O0FBRWpCLEtBQUcsQ0FBQyxNQUFNLEdBQUcsVUFBUyxPQUFPLEVBQUU7QUFDN0IsUUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUU7QUFDcEIsZUFBUyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDOztBQUVsRSxVQUFJLFlBQVksQ0FBQyxVQUFVLEVBQUU7QUFDM0IsaUJBQVMsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztPQUN0RTtBQUNELFVBQUksWUFBWSxDQUFDLFVBQVUsSUFBSSxZQUFZLENBQUMsYUFBYSxFQUFFO0FBQ3pELGlCQUFTLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7T0FDNUU7S0FDRixNQUFNO0FBQ0wsZUFBUyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO0FBQ3BDLGVBQVMsQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQztBQUN0QyxlQUFTLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUM7S0FDM0M7R0FDRixDQUFDOztBQUVGLEtBQUcsQ0FBQyxNQUFNLEdBQUcsVUFBUyxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUU7QUFDbEQsUUFBSSxZQUFZLENBQUMsY0FBYyxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQy9DLFlBQU0sMkJBQWMsd0JBQXdCLENBQUMsQ0FBQztLQUMvQztBQUNELFFBQUksWUFBWSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUNyQyxZQUFNLDJCQUFjLHlCQUF5QixDQUFDLENBQUM7S0FDaEQ7O0FBRUQsV0FBTyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7R0FDakYsQ0FBQztBQUNGLFNBQU8sR0FBRyxDQUFDO0NBQ1o7O0FBRU0sU0FBUyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUU7QUFDNUYsV0FBUyxJQUFJLENBQUMsT0FBTyxFQUFnQjtRQUFkLE9BQU8seURBQUcsRUFBRTs7QUFDakMsUUFBSSxhQUFhLEdBQUcsTUFBTSxDQUFDO0FBQzNCLFFBQUksTUFBTSxJQUFJLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDbkMsbUJBQWEsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUMxQzs7QUFFRCxXQUFPLEVBQUUsQ0FBQyxTQUFTLEVBQ2YsT0FBTyxFQUNQLFNBQVMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFDckMsT0FBTyxDQUFDLElBQUksSUFBSSxJQUFJLEVBQ3BCLFdBQVcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQ3hELGFBQWEsQ0FBQyxDQUFDO0dBQ3BCOztBQUVELE1BQUksR0FBRyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDOztBQUV6RSxNQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztBQUNqQixNQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztBQUN4QyxNQUFJLENBQUMsV0FBVyxHQUFHLG1CQUFtQixJQUFJLENBQUMsQ0FBQztBQUM1QyxTQUFPLElBQUksQ0FBQztDQUNiOztBQUVNLFNBQVMsY0FBYyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQ3hELE1BQUksQ0FBQyxPQUFPLEVBQUU7QUFDWixRQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLEVBQUU7QUFDckMsYUFBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7S0FDekMsTUFBTTtBQUNMLGFBQU8sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUMxQztHQUNGLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFOztBQUV6QyxXQUFPLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQztBQUN2QixXQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztHQUNyQztBQUNELFNBQU8sT0FBTyxDQUFDO0NBQ2hCOztBQUVNLFNBQVMsYUFBYSxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQ3ZELFNBQU8sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO0FBQ3ZCLE1BQUksT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUNmLFdBQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7R0FDdkU7O0FBRUQsTUFBSSxZQUFZLFlBQUEsQ0FBQztBQUNqQixNQUFJLE9BQU8sQ0FBQyxFQUFFLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7QUFDckMsV0FBTyxDQUFDLElBQUksR0FBRyxrQkFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekMsZ0JBQVksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7O0FBRTFELFFBQUksWUFBWSxDQUFDLFFBQVEsRUFBRTtBQUN6QixhQUFPLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0tBQzlFO0dBQ0Y7O0FBRUQsTUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLFlBQVksRUFBRTtBQUN6QyxXQUFPLEdBQUcsWUFBWSxDQUFDO0dBQ3hCOztBQUVELE1BQUksT0FBTyxLQUFLLFNBQVMsRUFBRTtBQUN6QixVQUFNLDJCQUFjLGNBQWMsR0FBRyxPQUFPLENBQUMsSUFBSSxHQUFHLHFCQUFxQixDQUFDLENBQUM7R0FDNUUsTUFBTSxJQUFJLE9BQU8sWUFBWSxRQUFRLEVBQUU7QUFDdEMsV0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0dBQ2xDO0NBQ0Y7O0FBRU0sU0FBUyxJQUFJLEdBQUc7QUFBRSxTQUFPLEVBQUUsQ0FBQztDQUFFOztBQUVyQyxTQUFTLFFBQVEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQy9CLE1BQUksQ0FBQyxJQUFJLElBQUksRUFBRSxNQUFNLElBQUksSUFBSSxDQUFBLEFBQUMsRUFBRTtBQUM5QixRQUFJLEdBQUcsSUFBSSxHQUFHLGtCQUFZLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUNyQyxRQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQztHQUNyQjtBQUNELFNBQU8sSUFBSSxDQUFDO0NBQ2I7O0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRTtBQUN6RSxNQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUU7QUFDaEIsUUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO0FBQ2YsUUFBSSxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzVGLFNBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0dBQzNCO0FBQ0QsU0FBTyxJQUFJLENBQUM7Q0FDYjs7Ozs7Ozs7QUMzUUQsU0FBUyxVQUFVLENBQUMsTUFBTSxFQUFFO0FBQzFCLE1BQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0NBQ3RCOztBQUVELFVBQVUsQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLFlBQVc7QUFDdkUsU0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztDQUN6QixDQUFDOztxQkFFYSxVQUFVOzs7Ozs7Ozs7Ozs7Ozs7QUNUekIsSUFBTSxNQUFNLEdBQUc7QUFDYixLQUFHLEVBQUUsT0FBTztBQUNaLEtBQUcsRUFBRSxNQUFNO0FBQ1gsS0FBRyxFQUFFLE1BQU07QUFDWCxLQUFHLEVBQUUsUUFBUTtBQUNiLEtBQUcsRUFBRSxRQUFRO0FBQ2IsS0FBRyxFQUFFLFFBQVE7QUFDYixLQUFHLEVBQUUsUUFBUTtDQUNkLENBQUM7O0FBRUYsSUFBTSxRQUFRLEdBQUcsWUFBWTtJQUN2QixRQUFRLEdBQUcsV0FBVyxDQUFDOztBQUU3QixTQUFTLFVBQVUsQ0FBQyxHQUFHLEVBQUU7QUFDdkIsU0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Q0FDcEI7O0FBRU0sU0FBUyxNQUFNLENBQUMsR0FBRyxvQkFBbUI7QUFDM0MsT0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDekMsU0FBSyxJQUFJLEdBQUcsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDNUIsVUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFO0FBQzNELFdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7T0FDOUI7S0FDRjtHQUNGOztBQUVELFNBQU8sR0FBRyxDQUFDO0NBQ1o7O0FBRU0sSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7Ozs7OztBQUtoRCxJQUFJLFVBQVUsR0FBRyxvQkFBUyxLQUFLLEVBQUU7QUFDL0IsU0FBTyxPQUFPLEtBQUssS0FBSyxVQUFVLENBQUM7Q0FDcEMsQ0FBQzs7O0FBR0YsSUFBSSxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDbkIsVUFJTSxVQUFVLEdBSmhCLFVBQVUsR0FBRyxVQUFTLEtBQUssRUFBRTtBQUMzQixXQUFPLE9BQU8sS0FBSyxLQUFLLFVBQVUsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLG1CQUFtQixDQUFDO0dBQ3BGLENBQUM7Q0FDSDtRQUNPLFVBQVUsR0FBVixVQUFVOzs7OztBQUlYLElBQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLElBQUksVUFBUyxLQUFLLEVBQUU7QUFDdEQsU0FBTyxBQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEdBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7Q0FDakcsQ0FBQzs7Ozs7QUFHSyxTQUFTLE9BQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFO0FBQ3BDLE9BQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDaEQsUUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxFQUFFO0FBQ3RCLGFBQU8sQ0FBQyxDQUFDO0tBQ1Y7R0FDRjtBQUNELFNBQU8sQ0FBQyxDQUFDLENBQUM7Q0FDWDs7QUFHTSxTQUFTLGdCQUFnQixDQUFDLE1BQU0sRUFBRTtBQUN2QyxNQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRTs7QUFFOUIsUUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRTtBQUMzQixhQUFPLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUN4QixNQUFNLElBQUksTUFBTSxJQUFJLElBQUksRUFBRTtBQUN6QixhQUFPLEVBQUUsQ0FBQztLQUNYLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUNsQixhQUFPLE1BQU0sR0FBRyxFQUFFLENBQUM7S0FDcEI7Ozs7O0FBS0QsVUFBTSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7R0FDdEI7O0FBRUQsTUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7QUFBRSxXQUFPLE1BQU0sQ0FBQztHQUFFO0FBQzlDLFNBQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7Q0FDN0M7O0FBRU0sU0FBUyxPQUFPLENBQUMsS0FBSyxFQUFFO0FBQzdCLE1BQUksQ0FBQyxLQUFLLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRTtBQUN6QixXQUFPLElBQUksQ0FBQztHQUNiLE1BQU0sSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7QUFDL0MsV0FBTyxJQUFJLENBQUM7R0FDYixNQUFNO0FBQ0wsV0FBTyxLQUFLLENBQUM7R0FDZDtDQUNGOztBQUVNLFNBQVMsV0FBVyxDQUFDLE1BQU0sRUFBRTtBQUNsQyxNQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQy9CLE9BQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3ZCLFNBQU8sS0FBSyxDQUFDO0NBQ2Q7O0FBRU0sU0FBUyxXQUFXLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtBQUN2QyxRQUFNLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztBQUNsQixTQUFPLE1BQU0sQ0FBQztDQUNmOztBQUVNLFNBQVMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLEVBQUUsRUFBRTtBQUNqRCxTQUFPLENBQUMsV0FBVyxHQUFHLFdBQVcsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFBLEdBQUksRUFBRSxDQUFDO0NBQ3BEOzs7O0FDM0dEO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIGVzbGludC1kaXNhYmxlIGNvbW1hLXN0eWxlLCBvcGVyYXRvci1saW5lYnJlYWssIHNwYWNlLXVuYXJ5LW9wcywgbm8tbXVsdGktc3BhY2VzLCBrZXktc3BhY2luZywgaW5kZW50ICovXG4ndXNlIHN0cmljdCdcblxuY29uc3QgYW5hbHl6ZUhvbGRlbSA9IHJlcXVpcmUoJy4vbGliL2hvbGRlbScpXG5cbi8qKlxuICogQW5hbHl6ZXMgYSBnaXZlbiBQb2tlckhhbmQgd2hpY2ggaGFzIGJlZW4gcGFyc2VkIGJ5IHRoZSBIYW5kSGlzdG9yeSBQYXJzZXIgaGhwLlxuICogUmVsYXRpdmUgcGxheWVyIHBvc2l0aW9ucyBhcmUgY2FsY3VsYXRlZCwgaS5lLiBjdXRvZmYsIGJ1dHRvbiwgZXRjLlxuICogUGxheWVycyBhcmUgaW5jbHVkZWQgaW4gb3JkZXIgb2YgYWN0aW9uIG9uIGZsb3AuXG4gKlxuICogVGhlIGFuYWx5emVkIGhhbmQgdGhlbiBjYW4gYmUgdmlzdWFsaXplZCBieSBbaGh2XShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGh2KS5cbiAqXG4gKiBGb3IgYW4gZXhhbXBsZSBvZiBhbiBhbmFseXplZCBoYW5kIHBsZWFzZSB2aWV3IFtqc29uIG91dHB1dCBvZiBhbiBhbmFseXplZFxuICogaGFuZF0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hodi9ibG9iL21hc3Rlci90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uKS5cbiAqXG4gKiBAbmFtZSBhbmFseXplXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBoYW5kIGhhbmQgaGlzdG9yeSBhcyBwYXJzZWQgYnkgW2hocF0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hocClcbiAqIEByZXR1cm4ge29iamVjdH0gdGhlIGFuYWx5emVkIGhhbmRcbiAqL1xuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYW5hbHl6ZShoYW5kKSB7XG4gIGlmICghaGFuZC5pbmZvKSB0aHJvdyBuZXcgRXJyb3IoJ0hhbmQgaXMgbWlzc2luZyBpbmZvJylcbiAgaWYgKGhhbmQuaW5mby5wb2tlcnR5cGUgPT09ICdob2xkZW0nKSByZXR1cm4gYW5hbHl6ZUhvbGRlbShoYW5kKVxufVxuXG5leHBvcnRzLnNjcmlwdCAgICAgPSByZXF1aXJlKCcuL2xpYi9zY3JpcHQnKVxuZXhwb3J0cy5zdG9yeWJvYXJkID0gcmVxdWlyZSgnLi9saWIvc3Rvcnlib2FyZCcpXG5leHBvcnRzLnN1bW1hcnkgICAgID0gcmVxdWlyZSgnLi9saWIvc3VtbWFyeScpXG5cbmV4cG9ydHMuc3RyYXRlZ2ljUG9zaXRpb25zID0gcmVxdWlyZSgnLi9saWIvc3RyYXRlZ2ljLXBvc2l0aW9ucycpLmxpc3RcblxuZnVuY3Rpb24gd2FzQWN0aXZlKHgpIHtcbiAgcmV0dXJuIHgucHJlZmxvcFswXSAmJiB4LnByZWZsb3BbMF0udHlwZSAhPT0gJ2ZvbGQnXG59XG5cbi8qKlxuICogRmlsdGVycyBhbGwgcGxheWVycyB3aG8gZGlkbid0IGFjdCBpbiB0aGUgaGFuZCBvciBqdXN0IGZvbGRlZC5cbiAqXG4gKiBAbmFtZSBmaWx0ZXJJbmFjdGl2ZXNcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtBcnJheS48T2JqZWN0Pn0gcGxheWVycyBhbGwgcGxheWVycyBpbiB0aGUgaGFuZFxuICogQHJldHVybiB7QXJyYXkuPE9iamVjdD59IGFsbCBwbGF5ZXJzIHRoYXQgd2VyZSBhY3RpdmUgaW4gdGhlIGhhbmRcbiAqL1xuZXhwb3J0cy5maWx0ZXJJbmFjdGl2ZXMgPSBmdW5jdGlvbiBmaWx0ZXJJbmFjdGl2ZXMocGxheWVycykge1xuICBpZiAocGxheWVycyA9PSBudWxsKSByZXR1cm4gW11cbiAgcmV0dXJuIHBsYXllcnMuZmlsdGVyKHdhc0FjdGl2ZSlcbn1cblxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuY29uc3QgY2FyZE9yZGVyID0gWyAnMicsICczJywgJzQnLCAnNScsICc2JywgJzcnLCAnOCcsICdUJywgJ0onLCAnUScsICdLJywgJ0EnIF1cbmNvbnN0IHN0cmF0ZWdpY1Bvc2l0aW9ucyA9IHJlcXVpcmUoJy4vc3RyYXRlZ2ljLXBvc2l0aW9ucycpXG5cbmZ1bmN0aW9uIHJvdW5kKG4pIHtcbiAgcmV0dXJuIE1hdGgucm91bmQobiAqIDEwKSAvIDEwXG59XG5cbmZ1bmN0aW9uIG5vdG1ldGFkYXRhKGspIHtcbiAgcmV0dXJuIGsgIT09ICdtZXRhZGF0YSdcbn1cblxuZnVuY3Rpb24gY29weVZhbHVlcyhvKSB7XG4gIGZ1bmN0aW9uIGNvcHkoYWNjLCBrKSB7XG4gICAgYWNjW2tdID0gb1trXVxuICAgIHJldHVybiBhY2NcbiAgfVxuICBpZiAoIW8pIHJldHVybiBvXG4gIHJldHVybiBPYmplY3Qua2V5cyhvKVxuICAgIC5maWx0ZXIobm90bWV0YWRhdGEpXG4gICAgLnJlZHVjZShjb3B5LCB7fSlcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSG9sZUNhcmRzKGhjKSB7XG4gIGlmICghaGMpIHJldHVybiBoY1xuICBjb25zdCBjMSA9IGhjLmNhcmQxXG4gIGNvbnN0IGMyID0gaGMuY2FyZDJcbiAgaWYgKGMxID09IG51bGwgfHwgYzIgPT0gbnVsbCkgcmV0dXJuIGhjXG4gIC8vIHNob3cgbGFyZ2UgY2FyZCBiZWZvcmUgc21hbGxlciBjYXJkXG4gIHJldHVybiBjYXJkT3JkZXIuaW5kZXhPZihjMVswXSkgPCBjYXJkT3JkZXIuaW5kZXhPZihjMlswXSlcbiAgICA/IHsgY2FyZDE6IGMyLCBjYXJkMjogYzEgfSA6IHsgY2FyZDE6IGMxLCBjYXJkMjogYzIgfVxufVxuXG5mdW5jdGlvbiBnZXRTdGFydGluZ1BvdChvLCBwbGF5ZXJDb3VudCkge1xuICBjb25zdCB0b3RhbEFudGUgPSAoby5hbnRlIHx8IDApICogcGxheWVyQ291bnRcbiAgcmV0dXJuICAoby5zYiB8fCAwKSArIChvLmJiIHx8IDApICsgdG90YWxBbnRlXG59XG5cbmZ1bmN0aW9uIHBvc3RGbG9wT3JkZXJGcm9tUHJlZmxvcE9yZGVyKG4sIHBsYXllckNvdW50KSB7XG4gIC8vIGhlYWRzdXAganVzdCByZXZlcnNlcyB0aGUgb3JkZXJcbiAgaWYgKHBsYXllckNvdW50ID09PSAyKSByZXR1cm4gbiA9PT0gMCA/IDEgOiAwXG5cbiAgaWYgKG4gPT09IChwbGF5ZXJDb3VudCAtIDEpKSByZXR1cm4gMSAvLyBCQlxuICBpZiAobiA9PT0gKHBsYXllckNvdW50IC0gMikpIHJldHVybiAwIC8vIFNCXG4gIHJldHVybiBuICsgMlxufVxuZnVuY3Rpb24gYnlQb3N0RmxvcE9yZGVyKHAxLCBwMikge1xuICByZXR1cm4gcDEucG9zdGZsb3BPcmRlciAtIHAyLnBvc3RmbG9wT3JkZXJcbn1cblxuZnVuY3Rpb24gc29ydFBsYXllcnNCeVBvc3RGbG9wT3JkZXIocGxheWVycykge1xuICBmdW5jdGlvbiBhcHBlbmRQbGF5ZXIoYWNjLCBrKSB7XG4gICAgY29uc3QgcCA9IHBsYXllcnNba11cbiAgICBwLm5hbWUgPSBrXG4gICAgYWNjLnB1c2gocClcbiAgICByZXR1cm4gYWNjXG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKHBsYXllcnMpXG4gICAgLnJlZHVjZShhcHBlbmRQbGF5ZXIsIFtdKVxuICAgIC5zb3J0KGJ5UG9zdEZsb3BPcmRlcilcbn1cblxuZnVuY3Rpb24gcGxheWVySW52ZXN0ZWQocHJlZmxvcCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHByZWZsb3AubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBhY3Rpb24gPSBwcmVmbG9wW2ldLnR5cGVcbiAgICBpZiAoYWN0aW9uID09PSAnYmV0JyB8fCBhY3Rpb24gPT09ICdjYWxsJyB8fCBhY3Rpb24gPT09ICdyYWlzZScpIHJldHVybiB0cnVlXG4gIH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbmZ1bmN0aW9uIHBsYXllclNhd1Nob3dkb3duKHApIHtcbiAgaWYgKHAuc2hvd2Rvd24ubGVuZ3RoKSByZXR1cm4gdHJ1ZVxuICBpZiAocC5yaXZlci5sZW5ndGggJiYgcC5yaXZlcltwLnJpdmVyLmxlbmd0aCAtIDFdLnR5cGUgIT09ICdmb2xkJykgcmV0dXJuIHRydWVcbiAgcmV0dXJuIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGFkZEFjdGl2aXR5SW5mbyhwbGF5ZXJzLCBpbmZvKSB7XG4gIHZhciBhbnlJbnZlc3RlZCAgICA9IGZhbHNlXG4gIHZhciBhbnlTYXdGbG9wICAgICA9IGZhbHNlXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBsYXllciAgICAgICA9IHBsYXllcnNbaV1cbiAgICBwbGF5ZXIuaW52ZXN0ZWQgICAgPSBwbGF5ZXIuc2IgfHwgcGxheWVyLmJiIHx8IHBsYXllckludmVzdGVkKHBsYXllci5wcmVmbG9wKVxuICAgIHBsYXllci5zYXdGbG9wICAgICA9ICEhcGxheWVyLmZsb3AubGVuZ3RoXG4gICAgcGxheWVyLnNhd1Nob3dkb3duID0gcGxheWVyU2F3U2hvd2Rvd24ocGxheWVyKVxuXG4gICAgaWYgKCFhbnlJbnZlc3RlZCkgYW55SW52ZXN0ZWQgPSBwbGF5ZXIuaW52ZXN0ZWRcbiAgICBpZiAoIWFueVNhd0Zsb3ApIGFueVNhd0Zsb3AgICA9IHBsYXllci5zYXdGbG9wXG4gIH1cblxuICBpbmZvLmFueUludmVzdGVkICAgID0gYW55SW52ZXN0ZWRcbiAgaW5mby5hbnlTYXdGbG9wICAgICA9IGFueVNhd0Zsb3Bcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ2hpcHMocHJldiwgY3VycmVudCwgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKSB7XG4gIE9iamVjdC5rZXlzKHBsYXllcnMpXG4gICAgLmZvckVhY2godXBkYXRlUGxheWVyQ2hpcHMsIHsgcHJldjogcHJldiwgY3VycmVudDogY3VycmVudCB9KVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVBsYXllckNoaXBzKGspIHtcbiAgICBjb25zdCBwID0gcGxheWVyc1trXVxuICAgIHZhciBjaGlwcyA9IHBbdGhpcy5wcmV2XSAtIChpbnZlc3RlZHNba10gfHwgMClcbiAgICBpZiAodGhpcy5wcmV2ID09PSAnY2hpcHNQcmVmbG9wJykge1xuICAgICAgaWYgKHAuYmIpIGNoaXBzICs9IGhhbmQuaW5mby5iYlxuICAgICAgaWYgKHAuc2IpIGNoaXBzICs9IGhhbmQuaW5mby5zYlxuICAgIH1cbiAgICBwLmNoaXBzQWZ0ZXIgPSBwW3RoaXMuY3VycmVudF0gPSBjaGlwc1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNoaXBzRm9yQWN0aW9uKGNoaXBzLCBhY3Rpb24sIGNvc3QsIHBsYXllcikge1xuICBhY3Rpb24uY2hpcHMgPSBjaGlwc1twbGF5ZXJdXG4gIGNoaXBzW3BsYXllcl0gLT0gY29zdFxuICBhY3Rpb24uY2hpcHNBZnRlciA9IGNoaXBzW3BsYXllcl1cbn1cblxuZnVuY3Rpb24gcG9zaXRpb25QbGF5ZXIocGxheWVyLCBwbGF5ZXJDb3VudCwgaWR4KSB7XG4gIHBsYXllci5wcmVmbG9wT3JkZXIgPSBpZHhcbiAgcGxheWVyLnBvc3RmbG9wT3JkZXIgPSBwb3N0RmxvcE9yZGVyRnJvbVByZWZsb3BPcmRlcihpZHgsIHBsYXllckNvdW50KVxuICBjb25zdCBwb3NpdGlvbnMgPSBzdHJhdGVnaWNQb3NpdGlvbnMoaWR4LCBwbGF5ZXJDb3VudClcbiAgcGxheWVyLnBvcyA9IHBvc2l0aW9ucy5wb3NcbiAgcGxheWVyLmV4YWN0UG9zID0gcG9zaXRpb25zLmV4YWN0UG9zXG59XG5cbmZ1bmN0aW9uIGFzc2lnblBvc2l0aW9uKHBsYXllciwgcGxheWVyQ291bnQsIGlkeCkge1xuICBpZiAocGxheWVyLmhhc093blByb3BlcnR5KCdwcmVmbG9wT3JkZXInKSkgcmV0dXJuXG4gIHBvc2l0aW9uUGxheWVyKHBsYXllciwgcGxheWVyQ291bnQsIGlkeClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhbmFseXplSG9sZGVtKGhhbmQpIHtcbiAgdmFyIHBvdCA9IDBcbiAgdmFyIGN1cnJlbnRCZXQgPSBoYW5kLmluZm8uYmJcblxuICBjb25zdCBwbGF5ZXJDb3VudCA9IGhhbmQuc2VhdHMubGVuZ3RoXG4gIGNvbnN0IHN0YXJ0aW5nUG90ID0gZ2V0U3RhcnRpbmdQb3QoaGFuZC5pbmZvLCBwbGF5ZXJDb3VudClcblxuICBjb25zdCBwbGF5ZXJzID0ge31cbiAgY29uc3QgYW5hbHl6ZWQgPSB7XG4gICAgICBpbmZvICAgIDogY29weVZhbHVlcyhoYW5kLmluZm8pXG4gICAgLCB0YWJsZSAgIDogY29weVZhbHVlcyhoYW5kLnRhYmxlKVxuICAgICwgYm9hcmQgICA6IGNvcHlWYWx1ZXMoaGFuZC5ib2FyZClcbiAgICAsIGhlcm8gICAgOiBoYW5kLmhlcm9cbiAgfVxuICBpZiAoYW5hbHl6ZWQuaW5mby5hbnRlID09IG51bGwpIGFuYWx5emVkLmluZm8uYW50ZSA9IDBcbiAgYW5hbHl6ZWQucG90cyA9IHtcbiAgICBwcmVmbG9wOiBzdGFydGluZ1BvdFxuICB9XG4gIGFuYWx5emVkLmluZm8ucGxheWVycyA9IHBsYXllckNvdW50XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwbGF5ZXJDb3VudDsgaSsrKSB7XG4gICAgY29uc3QgcyA9IGhhbmQuc2VhdHNbaV1cbiAgICBjb25zdCBwbGF5ZXIgPSB7XG4gICAgICAgIHNlYXRubyAgICAgICAgOiBzLnNlYXRub1xuICAgICAgLCBjaGlwcyAgICAgICAgIDogcy5jaGlwc1xuICAgICAgLCBjaGlwc1ByZWZsb3AgIDogcy5jaGlwc1xuICAgICAgLCBjaGlwc0Zsb3AgICAgIDogTmFOXG4gICAgICAsIGNoaXBzVHVybiAgICAgOiBOYU5cbiAgICAgICwgY2hpcHNSaXZlciAgICA6IE5hTlxuICAgICAgLCBjaGlwc1Nob3dkb3duIDogTmFOXG4gICAgICAsIGNoaXBzQWZ0ZXIgICAgOiBOYU5cbiAgICAgICwgbSAgICAgICAgICAgICA6IE1hdGgucm91bmQocy5jaGlwcyAvIHN0YXJ0aW5nUG90KVxuICAgICAgLCBwcmVmbG9wICAgICAgIDogW11cbiAgICAgICwgZmxvcCAgICAgICAgICA6IFtdXG4gICAgICAsIHR1cm4gICAgICAgICAgOiBbXVxuICAgICAgLCByaXZlciAgICAgICAgIDogW11cbiAgICAgICwgc2hvd2Rvd24gICAgICA6IFtdXG4gICAgfVxuICAgIGlmIChoYW5kLnRhYmxlLmJ1dHRvbiA9PT0gcy5zZWF0bm8pIHBsYXllci5idXR0b24gPSB0cnVlXG4gICAgaWYgKGhhbmQuaGVybyA9PT0gcy5wbGF5ZXIpIHtcbiAgICAgIHBsYXllci5oZXJvID0gdHJ1ZVxuICAgICAgaWYgKGhhbmQuaG9sZWNhcmRzKSB7XG4gICAgICAgIHBsYXllci5jYXJkcyA9IG5vcm1hbGl6ZUhvbGVDYXJkcyhoYW5kLmhvbGVjYXJkcylcbiAgICAgIH1cbiAgICB9XG4gICAgcGxheWVyc1tzLnBsYXllcl0gPSBwbGF5ZXJcbiAgfVxuICBhbmFseXplZC5wbGF5ZXJzID0gcGxheWVyc1xuXG4gIGZvciAoaSA9IDA7IGkgPCBoYW5kLnBvc3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQucG9zdHNbaV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIHBvdCArPSBwLmFtb3VudFxuICAgIHBsYXllci5jaGlwc0FmdGVyID0gcGxheWVyLmNoaXBzUHJlZmxvcCAtPSBwLmFtb3VudFxuXG4gICAgaWYgKHAudHlwZSA9PT0gJ3NiJykgcGxheWVyLnNiID0gdHJ1ZVxuICAgIGlmIChwLnR5cGUgPT09ICdiYicpIHBsYXllci5iYiA9IHRydWVcbiAgfVxuXG4gIGZ1bmN0aW9uIGFuYWx5emVBY3Rpb24ocCwgaW52ZXN0ZWQsIGNoaXBzKSB7XG4gICAgY29uc3Qgc3RhcnRpbmdQb3QgPSBwb3RcbiAgICB2YXIgY29zdCA9IDBcbiAgICB2YXIgYmV0RGVsdGEgPSAwXG4gICAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgdHlwZTogcC50eXBlXG4gICAgfVxuICAgIGlmIChwLnR5cGUgPT09ICdyYWlzZScpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAucmFpc2VUbyAvIGN1cnJlbnRCZXQpXG4gICAgICBhY3Rpb24uYWxsaW4gPSAhIXAuYWxsaW5cbiAgICAgIGFjdGlvbi5hbW91bnQgPSBwLnJhaXNlVG8gLSBpbnZlc3RlZFxuICAgICAgYmV0RGVsdGEgPSAxXG4gICAgICBjdXJyZW50QmV0ID0gcC5yYWlzZVRvXG4gICAgICBwb3QgKz0gY3VycmVudEJldFxuICAgICAgY29zdCA9IGFjdGlvbi5hbW91bnRcbiAgICB9IGVsc2UgaWYgKHAudHlwZSA9PT0gJ2JldCcpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAuYW1vdW50IC8gcG90KVxuICAgICAgYWN0aW9uLmFsbGluID0gISFwLmFsbGluXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5hbW91bnRcbiAgICAgIGN1cnJlbnRCZXQgPSBwLmFtb3VudFxuICAgICAgcG90ICs9IGN1cnJlbnRCZXRcbiAgICAgIGNvc3QgPSBhY3Rpb24uYW1vdW50XG4gICAgfSBlbHNlIGlmIChwLnR5cGUgPT09ICdjYWxsJykge1xuICAgICAgYWN0aW9uLnJhdGlvID0gcm91bmQocC5hbW91bnQgLyBwb3QpXG4gICAgICBhY3Rpb24uYWxsaW4gPSAhIXAuYWxsaW5cbiAgICAgIGFjdGlvbi5hbW91bnQgPSBwLmFtb3VudFxuICAgICAgcG90ICs9IHAuYW1vdW50XG4gICAgICBjb3N0ID0gYWN0aW9uLmFtb3VudFxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnY29sbGVjdCcpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAuYW1vdW50IC8gcG90KVxuICAgICAgYWN0aW9uLmFsbGluID0gZmFsc2VcbiAgICAgIGFjdGlvbi5hbW91bnQgPSBwLmFtb3VudFxuICAgICAgY29zdCA9IC1wLmFtb3VudFxuICAgICAgcG90ID0gMFxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnYmV0LXJldHVybmVkJykge1xuICAgICAgYWN0aW9uLnJhdGlvID0gcm91bmQocC5hbW91bnQgLyBwb3QpXG4gICAgICBhY3Rpb24uYWxsaW4gPSBmYWxzZVxuICAgICAgYWN0aW9uLmFtb3VudCA9IHAuYW1vdW50XG4gICAgICBjb3N0ID0gLXAuYW1vdW50XG4gICAgICBwb3QgPSBwb3QgLSBwLmFtb3VudFxuICAgIH1cbiAgICBhY3Rpb24ucG90ID0gc3RhcnRpbmdQb3RcbiAgICBhY3Rpb24ucG90QWZ0ZXIgPSBzdGFydGluZ1BvdCArIGNvc3RcbiAgICBhY3Rpb24uY2hpcHMgPSBjaGlwc1xuICAgIGFjdGlvbi5jaGlwc0FmdGVyID0gY2hpcHMgLSBjb3N0XG4gICAgcmV0dXJuIHsgYWN0aW9uOiBhY3Rpb24sIGNvc3Q6IGNvc3QgfHwgMCwgYmV0RGVsdGE6IGJldERlbHRhIH1cbiAgfVxuXG4gIHZhciBpbnZlc3RlZHMgPSB7fVxuICB2YXIgY2hpcHMgPSB7fVxuICAvLyBzdGFydGluZyB3aXRoIG9uZSBiZXQsIGZpcnN0IHJhaXNlIGlzIHR3byBiZXQsIG5leHQgdGhyZWUgYmV0IGFuZCBzbyBvblxuICB2YXIgYmV0ID0gMVxuXG4gIGZ1bmN0aW9uIHN0YXJ0UHJlZmxvcENvc3QocCkge1xuICAgIGlmIChwLmJiKSByZXR1cm4gaGFuZC5pbmZvLmJiXG4gICAgaWYgKHAuc2IpIHJldHVybiBoYW5kLmluZm8uc2JcbiAgICByZXR1cm4gMFxuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0QmV0KGluZm8pIHtcbiAgICBiZXQgPSBiZXQgKyBpbmZvLmJldERlbHRhXG4gICAgaW5mby5hY3Rpb24uYmV0ID0gYmV0XG4gIH1cblxuICAvL1xuICAvLyBQcmVmbG9wXG4gIC8vXG4gIGZvciAoaSA9IDA7IGkgPCBoYW5kLnByZWZsb3AubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5wcmVmbG9wW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBjb25zdCBpbnZlc3RlZCA9IGludmVzdGVkc1twLnBsYXllcl0gfHwgc3RhcnRQcmVmbG9wQ29zdChwbGF5ZXIpXG4gICAgaWYgKHR5cGVvZiBjaGlwc1twLnBsYXllcl0gPT09ICd1bmRlZmluZWQnKSBjaGlwc1twLnBsYXllcl0gPSBwbGF5ZXIuY2hpcHNQcmVmbG9wXG5cbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBhZGp1c3RCZXQoaW5mbylcblxuICAgIHBsYXllci5wcmVmbG9wLnB1c2goaW5mby5hY3Rpb24pXG4gICAgYXNzaWduUG9zaXRpb24ocGxheWVyLCBwbGF5ZXJDb3VudCwgaSlcbiAgICBpbnZlc3RlZHNbcC5wbGF5ZXJdID0gaW52ZXN0ZWQgKyBpbmZvLmNvc3RcbiAgICB1cGRhdGVDaGlwc0ZvckFjdGlvbihjaGlwcywgaW5mby5hY3Rpb24sIGluZm8uY29zdCwgcC5wbGF5ZXIpXG4gIH1cbiAgdXBkYXRlQ2hpcHMoJ2NoaXBzUHJlZmxvcCcsICdjaGlwc0Zsb3AnLCBpbnZlc3RlZHMsIHBsYXllcnMsIGhhbmQpXG5cbiAgLy9cbiAgLy8gRmxvcFxuICAvL1xuICBhbmFseXplZC5wb3RzLmZsb3AgPSBwb3RcbiAgaW52ZXN0ZWRzID0ge31cbiAgYmV0ID0gMVxuICBmb3IgKGkgPSAwOyBpIDwgaGFuZC5mbG9wLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQuZmxvcFtpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgY29uc3QgaW52ZXN0ZWQgPSBpbnZlc3RlZHNbcC5wbGF5ZXJdIHx8IDBcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBhZGp1c3RCZXQoaW5mbylcblxuICAgIHBsYXllci5mbG9wLnB1c2goaW5mby5hY3Rpb24pXG4gICAgaW52ZXN0ZWRzW3AucGxheWVyXSA9IGludmVzdGVkICsgaW5mby5jb3N0XG4gICAgdXBkYXRlQ2hpcHNGb3JBY3Rpb24oY2hpcHMsIGluZm8uYWN0aW9uLCBpbmZvLmNvc3QsIHAucGxheWVyKVxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc0Zsb3AnLCAnY2hpcHNUdXJuJywgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKVxuXG4gIC8vXG4gIC8vIFR1cm5cbiAgLy9cbiAgYW5hbHl6ZWQucG90cy50dXJuID0gcG90XG4gIGludmVzdGVkcyA9IHt9XG4gIGJldCA9IDFcbiAgZm9yIChpID0gMDsgaSA8IGhhbmQudHVybi5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnR1cm5baV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIGNvbnN0IGludmVzdGVkID0gaW52ZXN0ZWRzW3AucGxheWVyXSB8fCAwXG4gICAgY29uc3QgaW5mbyA9IGFuYWx5emVBY3Rpb24ocCwgaW52ZXN0ZWQpXG4gICAgYWRqdXN0QmV0KGluZm8pXG5cbiAgICBwbGF5ZXIudHVybi5wdXNoKGluZm8uYWN0aW9uKVxuICAgIGludmVzdGVkc1twLnBsYXllcl0gPSBpbnZlc3RlZCArIGluZm8uY29zdFxuICAgIHVwZGF0ZUNoaXBzRm9yQWN0aW9uKGNoaXBzLCBpbmZvLmFjdGlvbiwgaW5mby5jb3N0LCBwLnBsYXllcilcbiAgfVxuICB1cGRhdGVDaGlwcygnY2hpcHNUdXJuJywgJ2NoaXBzUml2ZXInLCBpbnZlc3RlZHMsIHBsYXllcnMsIGhhbmQpXG5cbiAgLy9cbiAgLy8gUml2ZXJcbiAgLy9cbiAgYW5hbHl6ZWQucG90cy5yaXZlciA9IHBvdFxuICBpbnZlc3RlZHMgPSB7fVxuICBiZXQgPSAxXG4gIGZvciAoaSA9IDA7IGkgPCBoYW5kLnJpdmVyLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQucml2ZXJbaV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIGNvbnN0IGludmVzdGVkID0gaW52ZXN0ZWRzW3AucGxheWVyXSB8fCAwXG4gICAgY29uc3QgaW5mbyA9IGFuYWx5emVBY3Rpb24ocCwgaW52ZXN0ZWQpXG4gICAgYWRqdXN0QmV0KGluZm8pXG5cbiAgICBwbGF5ZXIucml2ZXIucHVzaChpbmZvLmFjdGlvbilcbiAgICBpbnZlc3RlZHNbcC5wbGF5ZXJdID0gaW52ZXN0ZWQgKyBpbmZvLmNvc3RcbiAgICB1cGRhdGVDaGlwc0ZvckFjdGlvbihjaGlwcywgaW5mby5hY3Rpb24sIGluZm8uY29zdCwgcC5wbGF5ZXIpXG4gIH1cbiAgdXBkYXRlQ2hpcHMoJ2NoaXBzUml2ZXInLCAnY2hpcHNTaG93ZG93bicsIGludmVzdGVkcywgcGxheWVycywgaGFuZClcblxuICAvL1xuICAvLyBTaG93ZG93blxuICAvL1xuICBhbmFseXplZC5wb3RzLnNob3dkb3duID0gcG90XG4gIC8vIGZpcnN0IHdlIGFnZ3JlZ2F0ZSBhbGwgY29sbGVjdGlvbnMgYW5kIHRoZW4gY29uZGVuc2UgaW50byBvbmUgYWN0aW9uXG4gIHZhciBjb2xsZWN0ZWRzID0ge31cbiAgZm9yIChpID0gMDsgaSA8IGhhbmQuc2hvd2Rvd24ubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5zaG93ZG93bltpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgLy8gaW4gc29tZSByYXJlIGNhc2VzIHdlIHJlbW92ZWQgYSBwbGF5ZXIgdGhhdCBoYWQgbm8gYWN0aXZlIGludm9sdmVtZW1lbnQgaW4gdGhlIGhhbmRcbiAgICAvLyBpLmUuIGlmIGhlIHdhcyBhbGxpbiBhZnRlciBwb3N0aW5nXG4gICAgaWYgKHBsYXllciA9PSBudWxsKSBjb250aW51ZVxuXG4gICAgaWYgKChwLnR5cGUgPT09ICdzaG93JyB8fCBwLnR5cGUgPT09ICdtdWNrJykgJiZcbiAgICAgIHBsYXllci5jYXJkcyA9PSBudWxsICYmIHAuY2FyZDEgIT0gbnVsbCAmJiBwLmNhcmQyICE9IG51bGwpIHtcbiAgICAgIHBsYXllci5jYXJkcyA9IG5vcm1hbGl6ZUhvbGVDYXJkcyh7IGNhcmQxOiBwLmNhcmQxLCBjYXJkMjogcC5jYXJkMiB9KVxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnY29sbGVjdCcpIHtcbiAgICAgIGNvbGxlY3RlZHNbcC5wbGF5ZXJdID0gKGNvbGxlY3RlZHNbcC5wbGF5ZXJdIHx8IDApICsgcC5hbW91bnRcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhjb2xsZWN0ZWRzKS5mb3JFYWNoKHByb2Nlc3NDb2xsZWN0ZWRzKVxuICBmdW5jdGlvbiBwcm9jZXNzQ29sbGVjdGVkcyhrKSB7XG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1trXVxuICAgIGNvbnN0IGFtb3VudCA9IGNvbGxlY3RlZHNba11cbiAgICBjb25zdCByYXRpbyA9IHJvdW5kKGFtb3VudCAvIHBvdClcbiAgICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICAgIHR5cGUgICAgICAgOiAnY29sbGVjdCdcbiAgICAgICwgcmF0aW8gICAgICA6IHJhdGlvXG4gICAgICAsIHdpbmFsbCAgICAgOiByYXRpbyA9PT0gMVxuICAgICAgLCBhbW91bnQgICAgIDogYW1vdW50XG4gICAgICAsIGNoaXBzICAgICAgOiBjaGlwc1trXVxuICAgICAgLCBjaGlwc0FmdGVyIDogY2hpcHNba10gKyBhbW91bnRcbiAgICB9XG4gICAgcGxheWVyLnNob3dkb3duLnB1c2goYWN0aW9uKVxuICAgIHBsYXllci5jaGlwc0FmdGVyICs9IGFtb3VudFxuICB9XG5cbiAgLy8gSW4gc29tZSByYXJlIGNhc2VzIGEgcGxheWVyIGlzIGFsbGluIGFmdGVyIHBvc3RpbmcgYW5kIGRvZXNuJ3QgYWN0IGF0IGFsbFxuICAvLyBJbiB0aGF0IGNhc2Ugd2UganVzdCBwcmV0ZW5kIHRoYXQgcGxheWVyIG5ldmVyIGV4aXN0ZWQgc2luY2UgaGUncyBub3QgaW1wb3J0YW50XG4gIC8vIHRvIGFuYWx5emUgdGhlIGhhbmQgYW5kIGlzIHByb2JsZW1hdGljIHRvIGFzc2lnbiBhIHBvc2l0aW9uIHRvIGF0IHRoaXMgcG9pbnRcbiAgY29uc3QgcGxheWVyS2V5cyA9IE9iamVjdC5rZXlzKHBsYXllcnMpXG4gIGZvciAoaSA9IDA7IGkgPCBwbGF5ZXJLZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qga2V5ID0gcGxheWVyS2V5c1tpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNba2V5XVxuICAgIGlmIChwbGF5ZXIgPT0gbnVsbCB8fCBwbGF5ZXIucHJlZmxvcE9yZGVyID09IG51bGwpIGRlbGV0ZSBwbGF5ZXJzW2tleV1cbiAgfVxuXG4gIC8vIFNvbWUgY2FyZHMgYXJlIG9ubHkgZXhwb3NlZCBpbiBzaG93ZG93biAoc2VlbiBmb3IgbXVja2VkIGhhbmRzKSwgc28gbGV0J3MgdHJ5IHRvXG4gIC8vIGNhcHR1cmUgdGhlIG9uZXMgd2UgZGlkbid0IHNvIGZhci5cbiAgaWYgKGhhbmQuc3VtbWFyeSAhPSBudWxsKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGhhbmQuc3VtbWFyeS5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcCA9IGhhbmQuc3VtbWFyeVtpXVxuICAgICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICAgIGlmIChwbGF5ZXIgPT0gbnVsbCkgY29udGludWVcblxuICAgICAgaWYgKChwLnR5cGUgPT09ICdzaG93JyB8fCBwLnR5cGUgPT09ICdzaG93ZWQnIHx8IHAudHlwZSA9PT0gJ211Y2snKSAmJlxuICAgICAgICBwbGF5ZXIuY2FyZHMgPT0gbnVsbCAmJiBwLmNhcmQxICE9IG51bGwgJiYgcC5jYXJkMiAhPSBudWxsKSB7XG4gICAgICAgIHBsYXllci5jYXJkcyA9IG5vcm1hbGl6ZUhvbGVDYXJkcyh7IGNhcmQxOiBwLmNhcmQxLCBjYXJkMjogcC5jYXJkMiB9KVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFuYWx5emVkLnBsYXllcnMgPSBzb3J0UGxheWVyc0J5UG9zdEZsb3BPcmRlcihwbGF5ZXJzKVxuICBhZGRBY3Rpdml0eUluZm8oYW5hbHl6ZWQucGxheWVycywgYW5hbHl6ZWQuaW5mbylcbiAgcmV0dXJuIGFuYWx5emVkXG59XG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gaWdub3JlU3RyZWV0cyhwKSB7XG4gIGZ1bmN0aW9uIGNvcHkoYWNjLCBrKSB7XG4gICAgaWYgKGsgPT09ICdwcmVmbG9wJyB8fCBrID09PSAnZmxvcCcgfHwgayA9PT0gJ3R1cm4nIHx8IGsgPT09ICdyaXZlcicgfHwgayA9PT0gJ3Nob3dkb3duJykgcmV0dXJuIGFjY1xuICAgIGFjY1trXSA9IHBba11cbiAgICByZXR1cm4gYWNjXG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKHApLnJlZHVjZShjb3B5LCB7fSlcbn1cblxuZnVuY3Rpb24gYWRkSW5kZXgocCwgaWR4KSB7XG4gIHAuaW5kZXggPSBpZHhcbn1cblxuZnVuY3Rpb24gYnlQcmVmbG9wT3JkZXIocDEsIHAyKSB7XG4gIHJldHVybiBwMS5wcmVmbG9wT3JkZXIgLSBwMi5wcmVmbG9wT3JkZXJcbn1cblxuZnVuY3Rpb24gYnlQb3N0ZmxvcE9yZGVyKHAxLCBwMikge1xuICByZXR1cm4gcDEucG9zdGZsb3BPcmRlciAtIHAyLnBvc3RmbG9wT3JkZXJcbn1cblxuZnVuY3Rpb24gYWRkQWN0aW9uKGFjdGlvbnMsIGFjdGlvbiwgcGxheWVyKSB7XG4gIGFjdGlvbnMucHVzaCh7IGFjdGlvbjogYWN0aW9uLCBwbGF5ZXJJbmRleDogcGxheWVyLmluZGV4IH0pXG59XG5cbmZ1bmN0aW9uIGFkZFN0cmVldChhY2MsIHN0cmVldE5hbWUsIHBzKSB7XG4gIGNvbnN0IGFjdGlvbnMgPSBbXVxuICBjb25zdCBjaGlwc0luRnJvbnRzID0gbmV3IEFycmF5KHBzLmxlbmd0aCkuZmlsbCgwKVxuICBsZXQgaWEgPSAwXG4gIGxldCBrZWVwR29pbmcgPSB0cnVlXG4gIGNvbnN0IGlzcHJlZmxvcCA9IHN0cmVldE5hbWUgPT09ICdwcmVmbG9wJ1xuICB3aGlsZSAoa2VlcEdvaW5nKSB7XG4gICAga2VlcEdvaW5nID0gZmFsc2VcbiAgICBmb3IgKHZhciBpcCA9IDA7IGlwIDwgcHMubGVuZ3RoOyBpcCsrKSB7XG4gICAgICBjb25zdCBwID0gcHNbaXBdXG4gICAgICBpZiAoaXNwcmVmbG9wKSB7XG4gICAgICAgIGNoaXBzSW5Gcm9udHNbaXBdID0gcC5jaGlwc0luRnJvbnRcbiAgICAgIH1cbiAgICAgIGNvbnN0IHN0cmVldCA9IHBbc3RyZWV0TmFtZV1cbiAgICAgIGNvbnN0IGFjdGlvbiA9IHN0cmVldC5sZW5ndGggPiBpYSAmJiBzdHJlZXRbaWFdXG4gICAgICBrZWVwR29pbmcgPSBrZWVwR29pbmcgfHwgISFhY3Rpb25cbiAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgYWRkQWN0aW9uKGFjdGlvbnMsIGFjdGlvbiwgcClcbiAgICAgICAgaWYgKHR5cGVvZiBhY3Rpb24uYW1vdW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGNoaXBzSW5Gcm9udHNbaXBdICs9IGFjdGlvbi5hbW91bnRcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb24uY2hpcHNJbkZyb250ID0gY2hpcHNJbkZyb250c1tpcF1cbiAgICAgIH1cbiAgICB9XG4gICAgaWErK1xuICB9XG4gIGFjY1tzdHJlZXROYW1lXSA9IGFjdGlvbnNcbn1cblxuLyoqXG4gKiBTY3JpcHRzIHdoYXQgaGFwcGVuZWQgaW4gYSBoYW5kIGludG8gYSBhY3Rpb25zIHNjcmlwdCBhcnJheS5cbiAqIFRoaXMgYXJyYXkgY2FuIGJlIHJlYWQgdG9wIGRvd24gdG8gcmVwbGF5IHRoZSBoYW5kLlxuICpcbiAqIFRoZSBwbGF5ZXJzIGFuZCBpbmZvIGZpZWxkcyBmcm9tIHRoZSBhbmFseXplZCBkYXRhIGFyZSBjb3BpZWQgb3Zlci5cbiAqIEVhY2ggYWN0aW9uIGluY2x1ZGVzIHRoZSBpbmRleCBhdCB3aGljaCB0aGUgcGxheWVyIHRoYXQncyBleGVjdXRpbmdcbiAqIHRoZSBhY3Rpb24gY2FuIGJlIGZvdW5kIGluIHRoZSBwbGF5ZXJzIGFycmF5LlxuICpcbiAqIFN0cnVjdHVyZSBvZiByZXR1cm5lZCBvYmplY3Q6XG4gKlxuICogYGBgXG4gKiBpbmZvOiBvYmplY3QgY29udGFpbmluZyBoYW5kIGluZm9cbiAqIHRhYmxlOiBvYmplY3QgY29udGFpbmluZyBpbmZvIGFib3V0IHRoZSB0YWJsZSBsaWtlIHRvdGFsIHNlYXRzXG4gKiBib2FyZDogb2JqZWN0IGNhcmRzIG9uIHRoZSBib2FyZFxuICogcGxheWVyczogYXJyYXkgb2YgYWxsIHBsYXllcnMgYXQgdGhlIHRhYmxlIGluY2x1ZGluZyBhbGwgaW5mbyBhYm91dCB0aGVpciBzdGFja3NcbiAqIGFjdGlvbnM6XG4gKiAgcHJlZmxvcCAgOiBhcnJheSBvZiBwcmVmbG9wIGFjdGlvbnNcbiAqICBmbG9wICAgICA6IGFycmF5IG9mIGZsb3AgYWN0aW9uc1xuICogIHR1cm4gICAgIDogYXJyYXkgb2YgdHVybiBhY3Rpb25zXG4gKiAgcml2ZXIgICAgOiBhcnJheSBvZiByaXZlciBhY3Rpb25zXG4gKiAgc2hvd2Rvd24gOiBhcnJheSBvZiBzaG93ZG93biBhY3Rpb25zXG4gKiBgYGBcbiAqXG4gKiBAbmFtZSBoaGEuc2NyaXB0XG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIGFuYWx5emVkIGhhbmQgZGF0YSBAc2VlIGhoYSgpXG4gKiBAcmV0dXJuIHtvYmplY3R9XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2NyaXB0KGRhdGEpIHtcbiAgY29uc3QgaGFuZCA9IHtcbiAgICAgIGluZm86IGRhdGEuaW5mb1xuICAgICwgdGFibGU6IGRhdGEudGFibGVcbiAgICAsIGJvYXJkOiBkYXRhLmJvYXJkXG4gICAgLCBwb3RzOiBkYXRhLnBvdHNcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZENoaXBzSW5Gcm9udChwKSB7XG4gICAgaWYgKHAuc2IpIHtcbiAgICAgIHAuY2hpcHNJbkZyb250ID0gZGF0YS5pbmZvLnNiXG4gICAgfSBlbHNlIGlmIChwLmJiKSB7XG4gICAgICBwLmNoaXBzSW5Gcm9udCA9IGRhdGEuaW5mby5iYlxuICAgIH0gZWxzZSB7XG4gICAgICBwLmNoaXBzSW5Gcm9udCA9IDBcbiAgICB9XG4gICAgcmV0dXJuIHBcbiAgfVxuXG4gIGRhdGEucGxheWVycy5mb3JFYWNoKGFkZENoaXBzSW5Gcm9udClcbiAgaGFuZC5wbGF5ZXJzID0gZGF0YS5wbGF5ZXJzLm1hcChpZ25vcmVTdHJlZXRzKVxuXG4gIGRhdGEucGxheWVycy5mb3JFYWNoKGFkZEluZGV4KVxuXG4gIGNvbnN0IGFjdGlvbnMgPSB7fVxuICAvLyBwcmVmbG9wXG4gIGRhdGEucGxheWVycy5zb3J0KGJ5UHJlZmxvcE9yZGVyKVxuICBhZGRTdHJlZXQoYWN0aW9ucywgJ3ByZWZsb3AnLCBkYXRhLnBsYXllcnMpXG5cbiAgLy8gZmxvcCwgdHVybiwgcml2ZXIsIHNob3dkb3duXG4gIGRhdGEucGxheWVycy5zb3J0KGJ5UG9zdGZsb3BPcmRlcilcbiAgYWRkU3RyZWV0KGFjdGlvbnMsICdmbG9wJywgZGF0YS5wbGF5ZXJzKVxuICBhZGRTdHJlZXQoYWN0aW9ucywgJ3R1cm4nLCBkYXRhLnBsYXllcnMpXG4gIGFkZFN0cmVldChhY3Rpb25zLCAncml2ZXInLCBkYXRhLnBsYXllcnMpXG4gIGFkZFN0cmVldChhY3Rpb25zLCAnc2hvd2Rvd24nLCBkYXRhLnBsYXllcnMpXG5cbiAgaGFuZC5hY3Rpb25zID0gYWN0aW9uc1xuICByZXR1cm4gaGFuZFxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IHB1dE1vbmV5SW4gPSB7XG4gICAgZm9sZCAgICA6IGZhbHNlXG4gICwgY2hlY2sgICA6IGZhbHNlXG4gICwgY29sbGVjdCA6IGZhbHNlXG4gICwgcG9zdCAgICA6IHRydWVcbiAgLCBjYWxsICAgIDogdHJ1ZVxuICAsIGJldCAgICAgOiB0cnVlXG4gICwgcmFpc2UgICA6IHRydWVcbn1cblxuY29uc3QgY2FyZHNPbkJvYXJkID0ge1xuICAgIHByZWZsb3AgIDogMFxuICAsIGZsb3AgICAgIDogM1xuICAsIHR1cm4gICAgIDogNFxuICAsIHJpdmVyICAgIDogNVxuICAsIHNob3dkb3duIDogNVxufVxuXG4vKipcbiAqIFRha2VzIGEgc2NyaXB0IG9mIGFjdGlvbnMgYW5kIGNhbGN1bGF0ZXMgdGhlIHN0YXRlcyBmb3IgZWFjaC5cbiAqIEFkZHMgcG9pbnRlcnMgdG8gdGhlIHN0YXRlIGF0IHRoZSBiZWdpbm5pbmcgb2YgZWFjaCBzY3JpcHQuXG4gKlxuICogVGhpcyBpcyB1c2VmdWwgaWYgeW91IHRyeSB0byBqdW1wIGFyb3VuZCBpbiB0aGUgaGFuZCBhbmQgcmVzZXRcbiAqIHRoZSBzdGF0ZSBvZiB0aGUgdGFibGUuXG4gKlxuICogQG5hbWUgaGhhLnN0b3J5Ym9hcmRcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtPYmplY3R9IHNjcmlwdCBjcmVhdGVkIHZpYSBAc2VlIGhoYTpzY3JpcHRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdG9yeWJvYXJkKHNjcmlwdCkge1xuICBjb25zdCBzdGF0ZXMgPSBbXVxuXG4gIC8vXG4gIC8vIGluaXRpYWxseVxuICAvL1xuICBmdW5jdGlvbiBnZXRWYWwoYWNjLCBrKSB7XG4gICAgaWYgKHNjcmlwdC5ib2FyZFtrXSkgYWNjLnB1c2goc2NyaXB0LmJvYXJkW2tdKVxuICAgIHJldHVybiBhY2NcbiAgfVxuXG4gIGNvbnN0IGJvYXJkID0gc2NyaXB0LmJvYXJkICYmIE9iamVjdC5rZXlzKHNjcmlwdC5ib2FyZCkucmVkdWNlKGdldFZhbCwgW10pIHx8IFtdXG5cbiAgLy8gd2lsbCBiZSBzcGFyc2UgaWYgbm90IGFsbCBwbGF5ZXJzIHByZXNlbnRcbiAgbGV0IHNlYXRzID0gbmV3IEFycmF5KHNjcmlwdC50YWJsZS5tYXhzZWF0cyArIDEpXG4gIGZ1bmN0aW9uIGFkZFNlYXQocCwgaWR4KSB7XG4gICAgc2VhdHNbcC5zZWF0bm9dID0ge1xuICAgICAgICBjaGlwcyAgICAgICA6IHAuY2hpcHNQcmVmbG9wXG4gICAgICAsIG5hbWUgICAgICAgIDogcC5uYW1lXG4gICAgICAsIG0gICAgICAgICAgIDogcC5tXG4gICAgICAsIHNiICAgICAgICAgIDogcC5zYlxuICAgICAgLCBiYiAgICAgICAgICA6IHAuYmJcbiAgICAgICwgYnV0dG9uICAgICAgOiBwLmJ1dHRvblxuICAgICAgLCBhY3Rpb24gICAgICA6IG51bGxcbiAgICAgICwgYW1vdW50ICAgICAgOiAwXG4gICAgICAsIGNoaXBzSW5Gcm9udDogcC5jaGlwc0luRnJvbnRcbiAgICAgICwgYmV0ICAgICAgICAgOiAwXG4gICAgICAsIGludmVzdGVkQmV0IDogcC5iYiA/IDEgOiAwXG4gICAgICAsIGhvbGVjYXJkcyAgIDogcC5jYXJkcyB8fCB7IGNhcmQxIDogJz8/JywgY2FyZDIgOiAnPz8nIH1cbiAgICAgICwgcGxheWVySWR4ICAgOiBpZHhcbiAgICAgICwgc2VhdG5vICAgICAgOiBwLnNlYXRub1xuICAgIH1cbiAgfVxuICBzY3JpcHQucGxheWVycy5mb3JFYWNoKGFkZFNlYXQpXG5cbiAgLy9cbiAgLy8gRnJvbSBub3cgb24gd2UgYWx3YXlzIG1hcCBzZWF0cyBldmVuIHRob3VnaCB3ZSByZXVzZSB0aGUgdmFyaWFibGVcbiAgLy8gaW4gb3JkZXIgdG8gYXZvaWQgYWZmZWN0aW5nIHByZXZpb3VzIHN0YXRlc1xuICAvL1xuXG4gIGZ1bmN0aW9uIHJlc2V0U2VhdChzKSB7XG4gICAgY29uc3Qgc3RyZWV0ID0gdGhpcy5zdHJlZXRcbiAgICBjb25zdCBzdGFnZSAgPSB0aGlzLnN0YWdlXG5cbiAgICBjb25zdCBwcmVmbG9wID0gc3RyZWV0ID09PSAncHJlZmxvcCdcbiAgICBjb25zdCBjaGlwc05hbWUgPSAnY2hpcHMnICsgc3RyZWV0WzBdLnRvVXBwZXJDYXNlKCkgKyBzdHJlZXQuc2xpY2UoMSlcbiAgICBjb25zdCBwID0gc2NyaXB0LnBsYXllcnNbcy5wbGF5ZXJJZHhdXG4gICAgY29uc3QgY2hpcHMgPSBwW2NoaXBzTmFtZV1cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgc2VhdHNbcC5zZWF0bm9dLCB7XG4gICAgICAgIGNoaXBzICAgICAgIDogY2hpcHNcbiAgICAgICwgYWN0aW9uICAgICAgOiBudWxsXG4gICAgICAsIGFtb3VudCAgICAgIDogMFxuICAgICAgLCBjaGlwc0luRnJvbnQ6IHByZWZsb3AgPyBwLmNoaXBzSW5Gcm9udCA6IDBcbiAgICAgICwgYmV0ICAgICAgICAgOiAwXG4gICAgICAsIGludmVzdGVkQmV0IDogcHJlZmxvcCAmJiBwLmJiID8gMSA6IDBcbiAgICAgICwgX2xhc3RVcGRhdGUgOiBzdGFnZVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBhZGFwdFNlYXQocywgaWR4KSB7XG4gICAgY29uc3QgcCA9IHRoaXMucFxuICAgIGNvbnN0IGEgPSB0aGlzLmFcbiAgICBjb25zdCBzdGFnZSA9IHRoaXMuc3RhZ2VcbiAgICBpZiAodHlwZW9mIHMgPT09ICd1bmRlZmluZWQnIHx8IHAuc2VhdG5vICE9PSBpZHgpIHJldHVybiBzXG5cbiAgICAvLyBjYXJkcyBhcmUgbm90IGF0IHBsYXllcidzIHNlYXQgYW55bW9yZSBhZnRlciBoZSBmb2xkZWRcbiAgICBjb25zdCBmb2xkZWQgPSBhLnR5cGUgPT09ICdmb2xkJ1xuICAgIGNvbnN0IGhvbGVjYXJkcyA9IGZvbGRlZCA/IG51bGwgOiBzLmhvbGVjYXJkc1xuICAgIGNvbnN0IGludmVzdGVkQmV0ID0gcHV0TW9uZXlJblthLnR5cGVdID8gYS5iZXQgOiBzLmludmVzdGVkQmV0XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHMsIHtcbiAgICAgICAgY2hpcHMgICAgICAgOiBhLmNoaXBzQWZ0ZXJcbiAgICAgICwgYWN0aW9uICAgICAgOiBhLnR5cGVcbiAgICAgICwgYW1vdW50ICAgICAgOiBhLmFtb3VudFxuICAgICAgLCBjaGlwc0luRnJvbnQ6IGEuY2hpcHNJbkZyb250XG4gICAgICAsIGJldCAgICAgICAgIDogYS5iZXQgfHwgMFxuICAgICAgLCBpbnZlc3RlZEJldCA6IGludmVzdGVkQmV0IHx8IDBcbiAgICAgICwgaG9sZWNhcmRzICAgOiBob2xlY2FyZHNcbiAgICAgICwgZm9sZGVkICAgICAgOiBmb2xkZWRcbiAgICAgICwgX2xhc3RVcGRhdGUgOiBzdGFnZVxuICAgIH0pXG4gIH1cblxuICBsZXQgc3RyZWV0SWR4cyA9IHtcbiAgICAgIHByZWZsb3AgIDogbnVsbFxuICAgICwgZmxvcCAgICAgOiBudWxsXG4gICAgLCB0dXJuICAgICA6IG51bGxcbiAgICAsIHJpdmVyICAgIDogbnVsbFxuICAgICwgc2hvd2Rvd24gOiBudWxsXG4gIH1cblxuICBjb25zdCBmb2xkZWQgPSB7fVxuXG4gIGZ1bmN0aW9uIGFkZEZvbGRlZCgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlYXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzID0gc2VhdHNbaV1cbiAgICAgIGlmIChzICYmIHMuZm9sZGVkKSBmb2xkZWRbcy5zZWF0bm9dID0gdHJ1ZVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbGxlY3RBY3Rpb24oc3RyZWV0KSB7XG4gICAgY29uc3QgZmxvcCA9IHN0cmVldCA9PT0gJ2Zsb3AnXG4gICAgZnVuY3Rpb24gdG9jb2xsZWN0KGFjYywgcykge1xuICAgICAgaWYgKGZvbGRlZFtzLnNlYXRub10pIHJldHVybiBhY2NcblxuICAgICAgLy8gc21hbGwgYmxpbmRzIHBvc3RlZCBhbmQgdGhlaXIgYmV0IHNpemUgaXMgMCAoaGFsZiBhIGJsaW5kKVxuICAgICAgLy8gaG93ZXZlciBpZiB0aGV5IGludmVzdGVkIG1vcmUgd2UnbGwgdXNlIHRoYXQgYW1vdW50XG4gICAgICBpZiAocy5zYiAmJiBmbG9wKSB7XG4gICAgICAgIGFjYy5wdXNoKHsgc2VhdG5vOiBzLnNlYXRubywgYmV0OiBzLmludmVzdGVkQmV0IHx8IDAgfSlcblxuICAgICAgLy8gYmlnIGJsaW5kcyBuZWVkIHRvIGhhdmUgdGhlaXIgYmlnIGJsaW5kIGNvbGxlY3RlZCBhdCBsZWFzdFxuICAgICAgfSBlbHNlIGlmIChzLmJiKSB7XG4gICAgICAgIGFjYy5wdXNoKHsgc2VhdG5vOiBzLnNlYXRubywgYmV0OiBNYXRoLm1heCgxLCAocy5pbnZlc3RlZEJldCB8fCAwKSkgfSlcblxuICAgICAgLy8gYWxsIG90aGVycyBoYXZlIG5vIGNoaXBzIGluIGZyb250IG9mIHRoZW0gaWYgdGhleSBkaWRuJ3QgaW52ZXN0XG4gICAgICB9IGVsc2UgaWYgKHMuaW52ZXN0ZWRCZXQpIHtcbiAgICAgICAgYWNjLnB1c2goeyBzZWF0bm86IHMuc2VhdG5vLCBiZXQ6IHMuaW52ZXN0ZWRCZXQgfSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2NcbiAgICB9XG5cbiAgICByZXR1cm4gc2VhdHMucmVkdWNlKHRvY29sbGVjdCwgW10pXG4gIH1cblxuICBmdW5jdGlvbiB3aXRoSG9sZWNhcmRzKHgpIHtcbiAgICByZXR1cm4geCAmJiAhIXguaG9sZWNhcmRzXG4gIH1cblxuICBmdW5jdGlvbiBpc0J1dHRvbih4KSB7XG4gICAgcmV0dXJuIHggJiYgISF4LmJ1dHRvblxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0U2VhdG5vKHgpIHtcbiAgICByZXR1cm4geC5zZWF0bm9cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFN0YWdlKHN0cmVldCwgaSkge1xuICAgIC8vIGFjY291bnQgZm9yIHRoZSBmYWN0IHRoYXQgdGhlIGZpcnN0IHNob3dkb3duIHN0YWdlIGFscmVhZHkgaGFzIGFuIGFjdGlvblxuICAgIGlmIChzdHJlZXQgIT09ICdzaG93ZG93bicpIHJldHVybiBzdHJlZXQgKyAnKycgKyAoaSArIDEpXG4gICAgcmV0dXJuIGkgPT09IDAgPyBzdHJlZXQgOiBzdHJlZXQgKyAnKycgKyBpXG4gIH1cblxuICBmdW5jdGlvbiBwcm9jZXNzU3RyZWV0KHN0cmVldCkge1xuICAgIGNvbnN0IGFjdGlvbnMgPSBzY3JpcHQuYWN0aW9uc1tzdHJlZXRdXG4gICAgY29uc3Qgb25ib2FyZCA9IGNhcmRzT25Cb2FyZFtzdHJlZXRdIHx8IDBcbiAgICBjb25zdCBjdXJyZW50Qm9hcmQgPSBib2FyZC5zbGljZSgwLCBvbmJvYXJkKVxuICAgIGNvbnN0IHByZWZsb3AgPSBzdHJlZXQgPT09ICdwcmVmbG9wJ1xuICAgIGNvbnN0IHNob3dkb3duID0gc3RyZWV0ID09PSAnc2hvd2Rvd24nXG5cbiAgICAvLyBjb2xsZWN0IGNoaXBzIGZpcnN0IGlmIHdlIG1hZGUgaXQgdG8gZmxvcCwgdHVybiwgcml2ZXIgb3Igc2hvd2Rvd25cbiAgICBjb25zdCBjb2xsZWN0ID0gIXByZWZsb3AgPyBjb2xsZWN0QWN0aW9uKCkgOiBbXVxuICAgIC8vIG1hcmsgZm9sZGVkIHBsYXllcnMgc28gd2UgZG9uJ3QgY29sbGVjdCB0aGVpciBjaGlwcyBhZ2FpbiBvbiBuZXh0IHN0cmVldFxuICAgIGFkZEZvbGRlZCgpXG5cbiAgICBzZWF0cyA9IHNlYXRzLm1hcChyZXNldFNlYXQsIHsgc3RyZWV0OiBzdHJlZXQsIHN0YWdlOiBzdHJlZXQgfSlcbiAgICBjb25zdCBkZWFsZXJBY3Rpb24gPSB7XG4gICAgICBjb2xsZWN0OiBjb2xsZWN0XG4gICAgfVxuICAgIGlmICghcHJlZmxvcCAmJiAhc2hvd2Rvd24pIHtcbiAgICAgIGRlYWxlckFjdGlvbi5ib2FyZCA9IHtcbiAgICAgICAgICBzdHJlZXQ6IHN0cmVldFxuICAgICAgICAsIG9uYm9hcmQ6IGNhcmRzT25Cb2FyZFtzdHJlZXRdXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZWZsb3ApIHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHNlYXRzLmZpbHRlcihpc0J1dHRvbikubWFwKGdldFNlYXRubylbMF1cbiAgICAgIGRlYWxlckFjdGlvbi5kZWFsdENhcmRzID0ge1xuICAgICAgICBzZWF0bm9zOiBzZWF0cy5maWx0ZXIod2l0aEhvbGVjYXJkcykubWFwKGdldFNlYXRubylcbiAgICAgIH1cbiAgICAgIGlmIChidXR0b24pIHtcbiAgICAgICAgZGVhbGVyQWN0aW9uLmJ1dHRvbiA9IHtcbiAgICAgICAgICBzZWF0bm86IGJ1dHRvblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyBzdGF0ZSBpcyBpZGVudGljYWwgdG8gdGhlIGZpcnN0IGFjdGlvbiBvbiB0aGUgc3RyZWV0LCBleGNlcHQgdGhlXG4gICAgLy8gYWN0aW9uIGhhc24ndCBleGVjdXRlZC5cbiAgICAvLyBUaHVzIGl0IGNsZWFycyB1cCBhbGwgY2hpcHMgaW4gZnJvbnQgb2YgdGhlIHBsYXllcnMgYW5kIGFkZHMgY2FyZHNcbiAgICAvLyB0byB0aGUgYm9hcmQuXG4gICAgLy8gRG9uJ3QgY3JlYXRlIHRoaXMgZm9yIHRoZSBzaG93ZG93biB0aG91Z2ggc2luY2Ugbm90aGluZyB2aXNpYmx5IGNoYW5nZXMgaGVyZVxuICAgIC8vIHVudGlsIHRoZSBuZXh0IHBsYXllciBhY3Rpb24gb2NjdXJzLlxuICAgIGlmIChzdHJlZXQgIT09ICdzaG93ZG93bicpIHtcbiAgICAgIHN0YXRlcy5wdXNoKHtcbiAgICAgICAgICBib2FyZCAgICAgICAgOiBjdXJyZW50Qm9hcmRcbiAgICAgICAgLCBib2FyZENoYW5nZWQgOiB0cnVlXG4gICAgICAgICwgcG90ICAgICAgICAgIDogc2NyaXB0LnBvdHNbc3RyZWV0XVxuICAgICAgICAsIGFjdGlvbiAgICAgICA6IGZhbHNlXG4gICAgICAgICwgc3RhZ2UgICAgICAgIDogc3RyZWV0XG4gICAgICAgICwgc2VhdHMgICAgICAgIDogc2VhdHNcbiAgICAgICAgLCBkZWFsZXJBY3Rpb24gOiBkZWFsZXJBY3Rpb25cbiAgICAgIH0pXG4gICAgICBzdHJlZXRJZHhzW3N0cmVldF0gPSBzdGF0ZXMubGVuZ3RoIC0gMVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBzaG93ZG93biBwb2ludHMgdG8gZmlyc3QgYWN0aW9uIGluIGl0XG4gICAgICBzdHJlZXRJZHhzW3N0cmVldF0gPSBzdGF0ZXMubGVuZ3RoXG4gICAgfVxuXG4gICAgaWYgKCFhY3Rpb25zLmxlbmd0aCkge1xuICAgICAgLy8gbWFrZSBzdXJlIHdlIHBsYXkgdG8gc2hvd2Rvd24gaW4gY2FzZSBhbGwgcGxheWVycyBhcmUgYWxsaW5cbiAgICAgIHJldHVybiBjdXJyZW50Qm9hcmQubGVuZ3RoID49IGNhcmRzT25Cb2FyZFtzdHJlZXRdXG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhY3Rpb24gPSBhY3Rpb25zW2ldXG4gICAgICBjb25zdCBwID0gc2NyaXB0LnBsYXllcnNbYWN0aW9uLnBsYXllckluZGV4XVxuICAgICAgY29uc3QgYSA9IGFjdGlvbi5hY3Rpb25cbiAgICAgIGNvbnN0IHN0YWdlID0gZ2V0U3RhZ2Uoc3RyZWV0LCBpKVxuXG4gICAgICBzZWF0cyA9IHNlYXRzLm1hcChhZGFwdFNlYXQsIHsgcDogcCwgYTogYSwgc3RhZ2U6IHN0YWdlIH0pXG4gICAgICBhY3Rpb24uc2VhdG5vID0gcC5zZWF0bm9cbiAgICAgIGNvbnN0IHN0YXRlID0ge1xuICAgICAgICAgIGJvYXJkICAgICAgICA6IGN1cnJlbnRCb2FyZFxuICAgICAgICAsIGJvYXJkQ2hhbmdlZCA6IGZhbHNlXG4gICAgICAgICwgcG90ICAgICAgICAgIDogc3RyZWV0ID09PSAnc2hvd2Rvd24nID8gMCA6IGEucG90QWZ0ZXJcbiAgICAgICAgLCBhY3Rpb24gICAgICAgOiBhY3Rpb25cbiAgICAgICAgLCBzdGFnZSAgICAgICAgOiBzdGFnZVxuICAgICAgICAsIHNlYXRzICAgICAgICA6IHNlYXRzXG4gICAgICB9XG4gICAgICAvLyBmb3Igc2hvd2Rvd24gd2UgY29tYmluZSB0aGUgZGVhbGVyIGFjdGlvbiB3aXRoIHdoYXRldmVyXG4gICAgICAvLyBlbHNlIGlzIGdvaW5nIG9uLCBpLmUuIHdpbm5lciBjb2xsZWN0aW5nIG1vbmV5XG4gICAgICBpZiAoc3RyZWV0ID09PSAnc2hvd2Rvd24nKSB7XG4gICAgICAgIC8vIHJldmVhbCBjYXJkcyBvbiBsYXN0IHNob3dkb3duIHN0YXRlXG4gICAgICAgIGlmIChpID09PSBhY3Rpb25zLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICBkZWFsZXJBY3Rpb24uaG9sZWNhcmRzID0ge1xuICAgICAgICAgICAgcmV2ZWFsOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICAgIHN0YXRlLmRlYWxlckFjdGlvbiA9IGRlYWxlckFjdGlvblxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzdGF0ZXMucHVzaChzdGF0ZSlcbiAgICB9XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIGxldCBtb3JlID0gcHJvY2Vzc1N0cmVldCgncHJlZmxvcCcpXG4gIGlmIChtb3JlKSBtb3JlID0gcHJvY2Vzc1N0cmVldCgnZmxvcCcpXG4gIGlmIChtb3JlKSBtb3JlID0gcHJvY2Vzc1N0cmVldCgndHVybicpXG4gIGlmIChtb3JlKSBtb3JlID0gcHJvY2Vzc1N0cmVldCgncml2ZXInKVxuICBpZiAobW9yZSkgcHJvY2Vzc1N0cmVldCgnc2hvd2Rvd24nKVxuXG4gIHJldHVybiB7XG4gICAgICBpbmZvICAgIDogc2NyaXB0LmluZm9cbiAgICAsIHBsYXllcnMgOiBzY3JpcHQucGxheWVyc1xuICAgICwgYm9hcmQgICA6IHNjcmlwdC5ib2FyZFxuICAgICwgcG90cyAgICA6IHNjcmlwdC5wb3RzXG4gICAgLCBzdGF0ZXMgIDogc3RhdGVzXG4gICAgLCBzdHJlZXRzIDogc3RyZWV0SWR4c1xuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxuLyogZXNsaW50LWRpc2FibGUgY2FtZWxjYXNlICovXG4vLyAgICAgICAgICAgIFsgZXhhY3QsIHJhbmdlIF1cbmNvbnN0IHNiICAgICA9IFsgJ3NiJywgJ3NiJyBdXG5jb25zdCBiYiAgICAgPSBbICdiYicsICdiYicgXVxuY29uc3QgdXRnICAgID0gWyAndXRnJywgJ2VhJyBdXG5jb25zdCB1dGcxICAgPSBbICd1dGcrMScsICdlYScgXVxuY29uc3QgdXRnMiAgID0gWyAndXRnKzInLCAnZWEnIF1cbmNvbnN0IG1wICAgICA9IFsgJ21wJywgJ21wJyBdXG5jb25zdCBsaiAgICAgPSBbICdsaicsICdtcCcgXVxuY29uc3QgaGogICAgID0gWyAnaGonLCAnbHQnIF1cbmNvbnN0IGNvICAgICA9IFsgJ2NvJywgJ2NvJyBdXG5jb25zdCBidSAgICAgPSBbICdidScsICdidScgXVxuXG4vLyAwIGJhc2VkIC4uIHN1YnN0cmFjdCAyXG5jb25zdCB0YWJsZSA9IFtcbiAgICAvLyBoZWFkc3VwXG4gICAgWyBzYiwgYmIgXVxuICAgIC8vIDMgcGxheWVyc1xuICAsIFsgYnUsIHNiLCBiYiBdXG4gICAgLy8gNCBwbGF5ZXJzXG4gICwgWyBjbywgYnUsIHNiLCBiYiBdXG4gICAgLy8gNSBwbGF5ZXJzXG4gICwgWyB1dGcsIGNvLCBidSwgc2IsIGJiIF1cbiAgICAvLyA2IHBsYXllcnNcbiAgLCBbIHV0ZywgdXRnMSwgY28sIGJ1LCBzYiwgYmIgXVxuICAgIC8vIDcgcGxheWVyc1xuICAsIFsgdXRnLCB1dGcxLCBoaiwgY28sIGJ1LCBzYiwgYmIgXVxuICAgIC8vIDggcGxheWVyc1xuICAsIFsgdXRnLCB1dGcxLCBsaiwgaGosIGNvLCBidSwgc2IsIGJiIF1cbiAgICAvLyA5IHBsYXllcnNcbiAgLCBbIHV0ZywgdXRnMSwgdXRnMiwgbGosIGhqLCBjbywgYnUsIHNiLCBiYiBdXG4gICAgLy8gMTAgcGxheWVyc1xuICAsIFsgdXRnLCB1dGcxLCB1dGcyLCBtcCwgbGosIGhqLCBjbywgYnUsIHNiLCBiYiBdXG5dXG5cbi8vIERldGVybWluZWQgIGJ5IG51bWJlciBvZiBhY3RpdmUgcGxheWVycyBhdCB0YWJsZVxuLy8gdXNpbmcgYWN0aW5nIG9yZGVyIHByZWZsb3BcbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0cmF0ZWdpY1Bvc2l0aW9ucyhvcmRlciwgYWN0aXZlUGxheWVycykge1xuICAvLyBpbiBvbmUgY2FzZSB3ZSBzYXcgdGhlIG9yZGVyIHRvbyBsYXJnZSBmb3IgdGhlIGdpdmVuIGFjdGl2ZSBwbGF5ZXJzXG4gIGNvbnN0IG5vcGxheWVycyA9IE1hdGgubWF4KGFjdGl2ZVBsYXllcnMgLSAyLCBvcmRlciAtIDEpXG4gIGNvbnN0IGNlbGwgPSB0YWJsZVtub3BsYXllcnNdW29yZGVyXVxuICByZXR1cm4ge1xuICAgICAgZXhhY3RQb3M6IGNlbGxbMF1cbiAgICAsIHBvczogY2VsbFsxXVxuICB9XG59XG5cbi8vIG9yZGVyZWQgYnkgcG9zdGZsb3AgcG9zaXRpb25cbmV4cG9ydHMubGlzdCA9IFsgJ3NiJywgJ2JiJywgJ2VhJywgJ21wJywgJ2x0JywgJ2NvJywgJ2J1JyBdXG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gZ2V0SGVhZGVyKGhhbmQpIHtcbiAgY29uc3QgaW5mbyA9IGhhbmQuaW5mb1xuICBjb25zdCB0YWJsZSA9IGhhbmQudGFibGVcbiAgY29uc3QgcmVzID0ge1xuICAgICAgcm9vbSAgICAgIDogaW5mby5yb29tXG4gICAgLCBnYW1ldHlwZSAgOiBpbmZvLmdhbWV0eXBlXG4gICAgLCBjdXJyZW5jeSAgOiBpbmZvLmN1cnJlbmN5IHx8ICckJ1xuICAgICwgZG9uYXRpb24gIDogaW5mby5kb25hdGlvbiAhPSBudWxsID8gaW5mby5kb25hdGlvbiA6IDEwXG4gICAgLCByYWtlICAgICAgOiBpbmZvLnJha2UgIT0gbnVsbCAgICAgPyBpbmZvLnJha2UgICAgIDogMVxuICAgICwgcG9rZXJ0eXBlIDogaW5mby5wb2tlcnR5cGVcbiAgICAsIGxpbWl0ICAgICA6IGluZm8ubGltaXRcbiAgICAsIHNiICAgICAgICA6IGluZm8uc2JcbiAgICAsIGJiICAgICAgICA6IGluZm8uYmJcbiAgICAsIGFudGUgICAgICA6IGluZm8uYW50ZVxuICAgICwgbWF4c2VhdHMgIDogdGFibGUubWF4c2VhdHNcbiAgfVxuXG4gIGlmIChpbmZvLmxldmVsICE9IG51bGwpIHJlcy5sZXZlbCA9IGluZm8ubGV2ZWxcbiAgcmV0dXJuIHJlc1xufVxuXG5mdW5jdGlvbiBkZXRlcm1pbmVQb3NpdGlvbihwKSB7XG4gIHJldHVybiAoXG4gICAgICBwLmV4YWN0UG9zICE9IG51bGwgPyBwLmV4YWN0UG9zXG4gICAgOiBwLnBvcyAhPSBudWxsID8gcC5wb3NcbiAgICA6IGBTRUFUJHtwLnNlYXRub31gXG4gICkudG9VcHBlckNhc2UoKVxufVxuXG5mdW5jdGlvbiBhbW91bnRJbkJCKGFtb3VudCwgYmIpIHtcbiAgcmV0dXJuIE1hdGgucm91bmQoYW1vdW50ICogMTAgLyBiYikgLyAxMFxufVxuXG5mdW5jdGlvbiBnZXRTZWF0cyhoYW5kKSB7XG4gIGNvbnN0IGJiID0gaGFuZC5pbmZvLmJiXG4gIGNvbnN0IHBsYXllcnMgPSBoYW5kLnBsYXllcnNcbiAgY29uc3Qgc2VhdHMgPSBbXVxuICB2YXIgaGVyb1xuICBjb25zdCBwcmVmbG9wU3VtbWFyeSA9IHt9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXJzW2ldXG4gICAgY29uc3QgcG9zID0gZGV0ZXJtaW5lUG9zaXRpb24ocClcbiAgICBjb25zdCBjaGlwc0JCID0gYW1vdW50SW5CQihwLmNoaXBzLCBiYilcbiAgICBjb25zdCBjaGlwc0Ftb3VudCA9IHAuY2hpcHNcbiAgICBjb25zdCBzZWF0ID0geyBwb3M6IHBvcywgY2hpcHNCQjogY2hpcHNCQiwgY2hpcHNBbW91bnQ6IGNoaXBzQW1vdW50LCBoZXJvOiAhIXAuaGVybyB9XG4gICAgaWYgKHNlYXQuaGVybykge1xuICAgICAgaGVybyA9IHNlYXRcbiAgICAgIGhlcm8ubSA9IHAubVxuICAgICAgcHJlZmxvcFN1bW1hcnkuY2FyZHMgPSBwLmNhcmRzXG4gICAgICBwcmVmbG9wU3VtbWFyeS5wb3MgPSBzZWF0LnBvc1xuICAgIH1cbiAgICBzZWF0cy5wdXNoKHNlYXQpXG4gIH1cbiAgcmV0dXJuIHsgc2VhdHM6IHNlYXRzLCBoZXJvOiBoZXJvLCBwcmVmbG9wU3VtbWFyeTogcHJlZmxvcFN1bW1hcnkgfVxufVxuXG5mdW5jdGlvbiBpc3RvdXJuZXkodHlwZSkge1xuICByZXR1cm4gL3RvdXJuYW1lbnQvLnRlc3QodHlwZSlcbn1cblxuZnVuY3Rpb24gZ2V0Q2hpcFN0YWNrUmF0aW8oZ2FtZXR5cGUsIGJiLCBwKSB7XG4gIGNvbnN0IHRvdXJuZXkgPSBpc3RvdXJuZXkoZ2FtZXR5cGUpXG4gIHZhciBsYWJlbCwgYW1vdW50XG4gIGlmICh0b3VybmV5KSB7XG4gICAgbGFiZWwgPSAnTSdcbiAgICBhbW91bnQgPSBwLm1cbiAgfSBlbHNlIHtcbiAgICBsYWJlbCA9ICdCQidcbiAgICBhbW91bnQgPSBwLmNoaXBzQkJcbiAgfVxuICByZXR1cm4geyBsYWJlbDogbGFiZWwsIGFtb3VudDogYW1vdW50IH1cbn1cblxuZnVuY3Rpb24gYWN0aXZlQWN0aW9uKHgpIHtcbiAgcmV0dXJuIHguYWN0aW9uLnR5cGUgIT09ICdjb2xsZWN0JyAmJiB4LmFjdGlvbi50eXBlICE9PSAnYmV0LXJldHVybmVkJ1xufVxuXG5mdW5jdGlvbiByZXNvbHZlUGxheWVyKGhhbmQsIGlkeCkge1xuICByZXR1cm4gaGFuZC5wbGF5ZXJzW2lkeF1cbn1cblxuZnVuY3Rpb24gZ2V0UGxheWVyQWN0aW9ucyhoYW5kLCBhY3Rpb25zKSB7XG4gIHZhciBmb2xkcyA9IDBcbiAgY29uc3QgYmIgPSBoYW5kLmluZm8uYmJcbiAgYWN0aW9ucyA9IGFjdGlvbnMuZmlsdGVyKGFjdGl2ZUFjdGlvbilcblxuICBjb25zdCBwbGF5ZXJBY3Rpb25zID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBhY3Rpb24gPSBhY3Rpb25zW2ldXG4gICAgY29uc3QgYSA9IGFjdGlvbi5hY3Rpb25cblxuICAgIGlmIChhLnR5cGUgPT09ICdmb2xkJykge1xuICAgICAgZm9sZHMrK1xuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICBpZiAoZm9sZHMgPiAwKSB7XG4gICAgICBwbGF5ZXJBY3Rpb25zLnB1c2goeyB0eXBlOiAnZm9sZHMnLCBudW1iZXI6IGZvbGRzIH0pXG4gICAgICBmb2xkcyA9IDBcbiAgICB9XG5cbiAgICBjb25zdCBwID0gcmVzb2x2ZVBsYXllcihoYW5kLCBhY3Rpb24ucGxheWVySW5kZXgpXG4gICAgY29uc3QgcGxheWVyQWN0aW9uID0geyBwb3M6IGRldGVybWluZVBvc2l0aW9uKHApLCB0eXBlOiBhLnR5cGUgfVxuICAgIGlmIChhLnR5cGUgPT09ICdjYWxsJyB8fCBhLnR5cGUgPT09ICdiZXQnIHx8IGEudHlwZSA9PT0gJ3JhaXNlJykge1xuICAgICAgcGxheWVyQWN0aW9uLmFtb3VudEJCID0gYW1vdW50SW5CQihhLmFtb3VudCwgYmIpXG4gICAgICBwbGF5ZXJBY3Rpb24uYW1vdW50ID0gYS5hbW91bnRcbiAgICB9XG5cbiAgICBwbGF5ZXJBY3Rpb25zLnB1c2gocGxheWVyQWN0aW9uKVxuICB9XG5cbiAgaWYgKGZvbGRzID4gMCkge1xuICAgIHBsYXllckFjdGlvbnMucHVzaCh7IHR5cGU6ICdmb2xkcycsIG51bWJlcjogZm9sZHMgfSlcbiAgfVxuXG4gIHJldHVybiBwbGF5ZXJBY3Rpb25zXG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQbGF5ZXJzSW52b2x2ZWQoYWN0aW9ucykge1xuICBjb25zdCBpZHhzID0ge31cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYWN0aW9uID0gYWN0aW9uc1tpXVxuICAgIGlkeHNbYWN0aW9uLnBsYXllckluZGV4XSA9IHRydWVcbiAgfVxuICByZXR1cm4gT2JqZWN0LmtleXMoaWR4cykubGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGdldEZsb3BTdW1tYXJ5KGhhbmQsIGJiKSB7XG4gIGNvbnN0IGJvYXJkID0gaGFuZC5ib2FyZFxuICBpZiAoYm9hcmQgPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICBjb25zdCBjYXJkMSA9IGJvYXJkLmNhcmQxXG4gIGNvbnN0IGNhcmQyID0gYm9hcmQuY2FyZDJcbiAgY29uc3QgY2FyZDMgPSBib2FyZC5jYXJkM1xuICBpZiAoY2FyZDEgPT0gbnVsbCB8fCBjYXJkMiA9PSBudWxsIHx8IGNhcmQzID09IG51bGwpIHJldHVybiBudWxsXG5cbiAgY29uc3QgcG90ID0gaGFuZC5wb3RzLmZsb3BcbiAgY29uc3QgcG90QkIgPSBhbW91bnRJbkJCKHBvdCwgYmIpXG5cbiAgY29uc3QgcGxheWVyc0ludm9sdmVkID0gcmVzb2x2ZVBsYXllcnNJbnZvbHZlZChoYW5kLmFjdGlvbnMuZmxvcClcblxuICByZXR1cm4geyBwb3Q6IHBvdCwgcG90QkI6IHBvdEJCLCBib2FyZDogWyBjYXJkMSwgY2FyZDIsIGNhcmQzIF0sIHBsYXllcnNJbnZvbHZlZDogcGxheWVyc0ludm9sdmVkIH1cbn1cblxuZnVuY3Rpb24gZ2V0VHVyblN1bW1hcnkoaGFuZCwgYmIpIHtcbiAgY29uc3QgYm9hcmQgPSBoYW5kLmJvYXJkXG4gIGlmIChib2FyZCA9PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gIGNvbnN0IGNhcmQgPSBib2FyZC5jYXJkNFxuICBpZiAoY2FyZCA9PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gIGNvbnN0IHBvdCA9IGhhbmQucG90cy50dXJuXG4gIGNvbnN0IHBvdEJCID0gYW1vdW50SW5CQihwb3QsIGJiKVxuXG4gIGNvbnN0IHBsYXllcnNJbnZvbHZlZCA9IHJlc29sdmVQbGF5ZXJzSW52b2x2ZWQoaGFuZC5hY3Rpb25zLnR1cm4pXG5cbiAgcmV0dXJuIHsgcG90OiBwb3QsIHBvdEJCOiBwb3RCQiwgYm9hcmQ6IGNhcmQsIHBsYXllcnNJbnZvbHZlZDogcGxheWVyc0ludm9sdmVkIH1cbn1cblxuZnVuY3Rpb24gZ2V0Uml2ZXJTdW1tYXJ5KGhhbmQsIGJiKSB7XG4gIGNvbnN0IGJvYXJkID0gaGFuZC5ib2FyZFxuICBpZiAoYm9hcmQgPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICBjb25zdCBjYXJkID0gYm9hcmQuY2FyZDVcbiAgaWYgKGNhcmQgPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICBjb25zdCBwb3QgPSBoYW5kLnBvdHMucml2ZXJcbiAgY29uc3QgcG90QkIgPSBhbW91bnRJbkJCKHBvdCwgYmIpXG5cbiAgY29uc3QgcGxheWVyc0ludm9sdmVkID0gcmVzb2x2ZVBsYXllcnNJbnZvbHZlZChoYW5kLmFjdGlvbnMucml2ZXIpXG5cbiAgcmV0dXJuIHsgcG90OiBwb3QsIHBvdEJCOiBwb3RCQiwgYm9hcmQ6IGNhcmQsIHBsYXllcnNJbnZvbHZlZDogcGxheWVyc0ludm9sdmVkIH1cbn1cblxuZnVuY3Rpb24gYW1vdW50cyhhbW91bnQsIGJiKSB7XG4gIHJldHVybiB7IGFtb3VudDogYW1vdW50LCBiYjogYW1vdW50SW5CQihhbW91bnQsIGJiKSB9XG59XG5cbmZ1bmN0aW9uIGdldFRvdGFsUG90KGhhbmQpIHtcbiAgLy8gYmFzaWNhbGx5IGxvb2tpbmcgZm9yIHRoZSBsYXJnZXN0IG51bWJlciBpbiB0aGUgZHVtYmVzdCB3YXkgcG9zc2libGUgOlAgKG1vc3QgbGlrZWx5IGFsc28gZmFzdGVzdClcbiAgY29uc3QgYmIgPSBoYW5kLmluZm8uYmJcbiAgY29uc3QgcG90cyA9IGhhbmQucG90c1xuICBpZiAocG90cyA9PSBudWxsKSByZXR1cm4gMFxuICB2YXIgbWF4ID0gMFxuICBpZiAocG90cy5wcmVmbG9wID09IG51bGwpIHJldHVybiBhbW91bnRzKG1heCwgYmIpXG4gIG1heCA9IHBvdHMucHJlZmxvcFxuICBpZiAocG90cy5mbG9wID09IG51bGwpIHJldHVybiBhbW91bnRzKG1heCwgYmIpXG4gIG1heCA9IE1hdGgubWF4KG1heCwgcG90cy5mbG9wKVxuICBpZiAocG90cy50dXJuID09IG51bGwpIHJldHVybiBhbW91bnRzKG1heCwgYmIpXG4gIG1heCA9IE1hdGgubWF4KG1heCwgcG90cy50dXJuKVxuICBpZiAocG90cy5yaXZlciA9PSBudWxsKSByZXR1cm4gYW1vdW50cyhtYXgsIGJiKVxuICBtYXggPSBNYXRoLm1heChtYXgsIHBvdHMucml2ZXIpXG4gIGlmIChwb3RzLnNob3dkb3duID09IG51bGwpIHJldHVybiBhbW91bnRzKG1heCwgYmIpXG4gIHJldHVybiBhbW91bnRzKE1hdGgubWF4KG1heCwgcG90cy5zaG93ZG93biksIGJiKVxufVxuXG5mdW5jdGlvbiBnZXRTcG9pbGVycyhwbGF5ZXJzKSB7XG4gIGNvbnN0IHNwb2lsZXJzID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IHBsYXllcnNbaV1cbiAgICBpZiAocC5oZXJvIHx8IHAuY2FyZHMgPT0gbnVsbCB8fCBwLmNhcmRzLmNhcmQxID09IG51bGwgfHwgcC5jYXJkcy5jYXJkMiA9PSBudWxsKSBjb250aW51ZVxuICAgIGNvbnN0IHBvcyA9IGRldGVybWluZVBvc2l0aW9uKHApXG4gICAgc3BvaWxlcnMucHVzaCh7IHBvczogcG9zLCBjYXJkczogcC5jYXJkcyB9KVxuICB9XG4gIHJldHVybiBzcG9pbGVyc1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgaGFuZCB0aGF0IHdhcyBhbmFseXplZCBhbmQgdGhlbiBzY3JpcHRlZCB0byBhIHN1bW1hcnkgcmVwcmVzZW50YXRpb24uXG4gKlxuICogVGhlIHN1bW1hcnkgaGFzIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAqXG4gKiAgLSBoZWFkZXI6IGNvbnRhaW5zIGdhbWUgaW5mbywgbGlrZSByb29tLCBwb2tlcnR5cGUsIGJsaW5kcywgZXRjLlxuICogIC0gc2VhdHM6IGxpc3RzIHRoZSBzZWF0cyBvZiB0aGUgcGxheWVycyBpbmNsdWRpbmcgcG9zLCBjaGlwcyBhbmQgaGVybyBpbmRpY2F0b3JzXG4gKiAgLSBjaGlwc1N0YWNrUmF0aW86IGhlcm8ncyBNIGZvciB0b3VybmFtZW50cywgaGlzIEJCcyBmb3IgY2FzaCBnYW1lc1xuICogIC0gcHJlZmxvcFN1bW1hcnk6IGhlcm8ncyBjYXJkcyBhbmQgcG9zaXRpb25cbiAqICAtIHByZWZsb3BBY3Rpb25zOiBhY3Rpb24gdHlwZXMgKyBhbW91bnRzIG9mIGVhY2ggcGxheWVyIGJ5IHBvc2l0aW9uXG4gKiAgLSBmbG9wU3VtbWFyeTogcG90IGF0IGZsb3AsIGJvYXJkIGFuZCBwbGF5ZXJzSW52b2x2ZWRcbiAqICAtIGZsb3BBY3Rpb25zOiBzYW1lIGFzIHByZWZsb3BBY3Rpb25zXG4gKiAgLSB0dXJuU3VtbWFyeTogcG90IGF0IHR1cm4sIHR1cm4gY2FyZCBhbmQgcGxheWVyc0ludm9sdmVkXG4gKiAgLSB0dXJuQWN0aW9uczogc2FtZSBhcyBwcmVmbG9wQWN0aW9uc1xuICogIC0gcml2ZXJTdW1tYXJ5OiBwb3QgYXQgcml2ZXIsIHJpdmVyIGNhcmQgYW5kIHBsYXllcnNJbnZvbHZlZFxuICogIC0gcml2ZXJBY3Rpb25zOiBzYW1lIGFzIHByZWZsb3BBY3Rpb25zXG4gKiAgLSB0b3RhbFBvdDogdG90YWwgbW9uZXkgaW4gdGhlIHBvdFxuICogIC0gc3BvaWxlcnM6IHBsYXllcnMgd2hvcyBjYXJkcyBhcmUga25vd24gYnkgcG9zaXRpb25cbiAqXG4gKiBAbmFtZSBoaGEuc3VtbWFyeVxuICpcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtPYmplY3R9IHNjcmlwdFxuICogQHJldHVybnMge09iamVjdH0gdGhlIGhhbmQgc3VtbWFyaXplZFxuICovXG5mdW5jdGlvbiBzdW1tYXJ5KGhhbmQpIHtcbiAgY29uc3QgcmVzID0ge31cbiAgaWYgKGhhbmQucGxheWVycyA9PSBudWxsIHx8IGhhbmQucGxheWVycy5sZW5ndGggPT09IDApIHJldHVybiByZXNcblxuICBjb25zdCBiYiA9IGhhbmQuaW5mby5iYlxuXG4gIHJlcy5oZWFkZXIgPSBnZXRIZWFkZXIoaGFuZClcbiAgY29uc3Qgc2VhdHNJbmZvID0gZ2V0U2VhdHMoaGFuZClcbiAgcmVzLnNlYXRzID0gc2VhdHNJbmZvLnNlYXRzXG4gIHJlcy5jaGlwU3RhY2tSYXRpbyA9IHNlYXRzSW5mby5oZXJvICE9IG51bGxcbiAgICA/IGdldENoaXBTdGFja1JhdGlvKHJlcy5oZWFkZXIuZ2FtZXR5cGUsIHJlcy5oZWFkZXIuYmIsIHNlYXRzSW5mby5oZXJvKVxuICAgIDogbnVsbFxuICByZXMucHJlZmxvcFN1bW1hcnkgPSBzZWF0c0luZm8ucHJlZmxvcFN1bW1hcnlcbiAgcmVzLnByZWZsb3BBY3Rpb25zID0gZ2V0UGxheWVyQWN0aW9ucyhoYW5kLCBoYW5kLmFjdGlvbnMucHJlZmxvcClcblxuICBpZiAoaGFuZC5hY3Rpb25zLmZsb3AgIT0gbnVsbCAmJiBoYW5kLmFjdGlvbnMuZmxvcC5sZW5ndGggPiAwKSB7XG4gICAgcmVzLmZsb3BTdW1tYXJ5ID0gZ2V0RmxvcFN1bW1hcnkoaGFuZCwgYmIpXG4gICAgcmVzLmZsb3BBY3Rpb25zID0gZ2V0UGxheWVyQWN0aW9ucyhoYW5kLCBoYW5kLmFjdGlvbnMuZmxvcClcbiAgfVxuXG4gIGlmIChoYW5kLmFjdGlvbnMudHVybiAhPSBudWxsICYmIGhhbmQuYWN0aW9ucy50dXJuLmxlbmd0aCA+IDApIHtcbiAgICByZXMudHVyblN1bW1hcnkgPSBnZXRUdXJuU3VtbWFyeShoYW5kLCBiYilcbiAgICByZXMudHVybkFjdGlvbnMgPSBnZXRQbGF5ZXJBY3Rpb25zKGhhbmQsIGhhbmQuYWN0aW9ucy50dXJuKVxuICB9XG5cbiAgaWYgKGhhbmQuYWN0aW9ucy5yaXZlciAhPSBudWxsICYmIGhhbmQuYWN0aW9ucy5yaXZlci5sZW5ndGggPiAwKSB7XG4gICAgcmVzLnJpdmVyU3VtbWFyeSA9IGdldFJpdmVyU3VtbWFyeShoYW5kLCBiYilcbiAgICByZXMucml2ZXJBY3Rpb25zID0gZ2V0UGxheWVyQWN0aW9ucyhoYW5kLCBoYW5kLmFjdGlvbnMucml2ZXIpXG4gIH1cblxuICByZXMudG90YWxQb3QgPSBnZXRUb3RhbFBvdChoYW5kKVxuICByZXMuc3BvaWxlcnMgPSBnZXRTcG9pbGVycyhoYW5kLnBsYXllcnMpXG5cbiAgcmV0dXJuIHJlc1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHN1bW1hcnlcbiIsIid1c2Ugc3RyaWN0J1xuXG5jb25zdCBzdHJpbmdVdGlsID0gcmVxdWlyZSgnLi9saWIvdXRpbC9zdHJpbmcnKVxuXG4vKiBlc2xpbnQtZGlzYWJsZSBjYW1lbGNhc2UgKi9cbmNvbnN0IGhvbGRlbV9wcyA9IHJlcXVpcmUoJy4vbGliL2hvbGRlbS9wb2tlcnN0YXJzJylcbmNvbnN0IGhvbGRlbV9pZyA9IHJlcXVpcmUoJy4vbGliL2hvbGRlbS9pZ25pdGlvbicpXG5cbmZ1bmN0aW9uIGdldExpbmVzKHR4dCkge1xuICBjb25zdCB0cmltbWVkID0gdHh0LnNwbGl0KCdcXG4nKS5tYXAoc3RyaW5nVXRpbC50cmltTGluZSlcbiAgd2hpbGUgKHRyaW1tZWRbMF0gJiYgIXRyaW1tZWRbMF0ubGVuZ3RoKSB0cmltbWVkLnNoaWZ0KClcbiAgcmV0dXJuIHRyaW1tZWRcbn1cblxuLyoqXG4gKiBQYXJzZXMgUG9rZXJIYW5kIEhpc3RvcmllcyBhcyBvdXRwdXQgYnkgdGhlIGdpdmVuIG9ubGluZSBQb2tlciBSb29tcy5cbiAqIEF1dG9kZXRlY3RzIHRoZSBnYW1lIHR5cGUgYW5kIHRoZSBQb2tlclJvb20uXG4gKiBTbyBmYXIgUG9rZXJTdGFycyBIb2xkZW0gaGFuZHMgYXJlIHN1cHBvcnRlZC5cbiAqXG4gKiBUaGUgcGFyc2VkIGhhbmRzIGNhbiB0aGVuIGJlIGZ1cnRoZXIgYW5hbHl6ZWQgd2l0aCB0aGVcbiAqIFtoaGFdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaGEpIG1vZHVsZS5cbiAqXG4gKiBBcyBhbiBleGFtcGxlIFt0aGlzXG4gKiBoYW5kXShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGhwL2Jsb2IvbWFzdGVyL3Rlc3QvZml4dHVyZXMvaG9sZGVtL3Bva2Vyc3RhcnMvYWN0aW9ub25hbGwudHh0KVxuICogaXMgcGFyc2VkIGludG8gW3RoaXMgb2JqZWN0XG4gKiByZXByZXNlbnRhdGlvbl0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hoYS9ibG9iL21hc3Rlci90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uKS5cbiAqXG4gKiBAbmFtZSBwYXJzZVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gaW5wdXQgdGhlIHRleHR1YWwgcmVwcmVzZW50YXRpb24gb2Ygb25lIHBva2VyIGhhbmQgYXMgd3JpdHRlbiB0byB0aGUgSGFuZEhpc3RvcnkgZm9sZGVyXG4gKiBAcGFyYW0ge29iamVjdD19IG9wdHMgdmFyaW91cyBvcHRpb25zXG4gKiBAcGFyYW0ge2Jvb2xlYW49fSBvcHRzLmluZm9Pbmx5IGRlbm90ZXMgdGhhdCBvbmx5IHRoZSBoZWFkZXIgbGluZSBvZiB0aGUgaGFuZCBpcyBwYXJzZWQgYW5kIG9ubHkgdGhlIGluZm8gb2JqZWN0IHJldHVybmVkXG4gKiBAcGFyYW0ge3N0cmluZz19IG9wdHMuYnV5aW5GaWxlIGZpbGUgbmFtZSBvdmVycmlkZXMgYnV5aW4gZm9yIHJvb21zIHRoYXQgZG9uJ3QgaW5jbHVkZSBpdCBpbiB0aGUgaGlzdG9yeSBsaWtlIElnbml0aW9uXG4gKiBAcmV0dXJuIHtvYmplY3R9IHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBoYW5kIHRvIGJlIHVzZWQgYXMgaW5wdXQgZm9yIG90aGVyIHRvb2xzIGxpa2UgaGhhXG4gKi9cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlKGlucHV0LCBvcHRzKSB7XG4gIGNvbnN0IGxpbmVzID0gQXJyYXkuaXNBcnJheShpbnB1dCkgPyBpbnB1dCA6IGdldExpbmVzKGlucHV0KS5maWx0ZXIoc3RyaW5nVXRpbC5lbXB0eUxpbmUpXG4gIGlmIChob2xkZW1fcHMuY2FuUGFyc2UobGluZXMpKSByZXR1cm4gaG9sZGVtX3BzLnBhcnNlKGxpbmVzLCBvcHRzKVxuICBpZiAoaG9sZGVtX2lnLmNhblBhcnNlKGxpbmVzKSkgcmV0dXJuIGhvbGRlbV9pZy5wYXJzZShsaW5lcywgb3B0cylcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBhbGwgaGFuZHMgZnJvbSBhIGdpdmVuIHRleHQgZmlsZS5cbiAqXG4gKiBAbmFtZSBleHRyYWN0SGFuZHNcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IHR4dCB0aGUgdGV4dCBjb250YWluaW5nIHRoZSBoYW5kc1xuICogQHJldHVybiB7QXJyYXkuPEFycmF5Pn0gYW4gYXJyYXkgb2YgaGFuZHMsIGVhY2ggaGFuZCBzcGxpdCBpbnRvIGxpbmVzXG4gKi9cbmV4cG9ydHMuZXh0cmFjdEhhbmRzID0gZnVuY3Rpb24gZXh0cmFjdEhhbmRzKHR4dCkge1xuICBjb25zdCBsaW5lcyA9IGdldExpbmVzKHR4dClcbiAgY29uc3QgaGFuZHMgPSBbXVxuICB2YXIgaGFuZCA9IFtdXG5cbiAgdmFyIGkgPSAwXG4gIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldICYmICFsaW5lc1tpXS5sZW5ndGgpIGkrKyAgIC8vIGlnbm9yZSBsZWFkaW5nIGVtcHR5IGxpbmVzXG4gIGZvciAoOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV1cbiAgICBpZiAobGluZS5sZW5ndGgpIHtcbiAgICAgIGhhbmQucHVzaChsaW5lKVxuICAgICAgLy8gbGFzdCBoYW5kIHRoYXQncyBub3QgZm9sbG93ZWQgYnkgZW1wdHkgbGluZVxuICAgICAgaWYgKGkgPT09IGxpbmVzLmxlbmd0aCAtIDEgJiYgaGFuZC5sZW5ndGgpIGhhbmRzLnB1c2goaGFuZClcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaGFuZCBmaW5pc2hlZFxuICAgICAgaWYgKGhhbmQubGVuZ3RoKSBoYW5kcy5wdXNoKGhhbmQpXG4gICAgICBoYW5kID0gW11cbiAgICAgIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldICYmICFsaW5lc1tpXS5sZW5ndGgpIGkrKyAgLy8gZmluZCBzdGFydCBvZiBuZXh0IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGhhbmRzXG59XG4iLCIndXNlIHN0cmljdCdcblxuY29uc3Qgc3RyaW5nVXRpbCAgICAgPSByZXF1aXJlKCcuLi91dGlsL3N0cmluZycpXG5jb25zdCBzYWZlUGFyc2VJbnQgICA9IHN0cmluZ1V0aWwuc2FmZVBhcnNlSW50XG5jb25zdCBzYWZlUGFyc2VGbG9hdCA9IHN0cmluZ1V0aWwuc2FmZVBhcnNlRmxvYXRcbmNvbnN0IHNhZmVUcmltICAgICAgID0gc3RyaW5nVXRpbC5zYWZlVHJpbVxuY29uc3Qgc2FmZUxvd2VyICAgICAgPSBzdHJpbmdVdGlsLnNhZmVMb3dlclxuY29uc3Qgc2FmZVVwcGVyICAgICAgPSBzdHJpbmdVdGlsLnNhZmVVcHBlclxuY29uc3Qgc2FmZUZpcnN0VXBwZXIgPSBzdHJpbmdVdGlsLnNhZmVGaXJzdFVwcGVyXG5jb25zdCBwcmljZUZyZWVyb2xsICA9IHJlcXVpcmUoJy4uL3V0aWwvdHdlYWtzJykucHJpY2VGcmVlcm9sbFxuXG5mdW5jdGlvbiBIYW5kSGlzdG9yeVBhcnNlcihsaW5lcywgb3B0cykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSGFuZEhpc3RvcnlQYXJzZXIpKSByZXR1cm4gbmV3IEhhbmRIaXN0b3J5UGFyc2VyKGxpbmVzLCBvcHRzKVxuXG4gIHRoaXMuX2xpbmVzID0gbGluZXNcbiAgdGhpcy5faW5mb09ubHkgPSBvcHRzICYmIG9wdHMuaW5mb09ubHlcblxuICB0aGlzLl9wb3N0ZWQgICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1ByZWZsb3AgID0gZmFsc2VcbiAgdGhpcy5fc2F3RmxvcCAgICAgPSBmYWxzZVxuICB0aGlzLl9zYXdUdXJuICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1JpdmVyICAgID0gZmFsc2VcbiAgdGhpcy5fc2F3U2hvd2Rvd24gPSBmYWxzZVxuICB0aGlzLl9zYXdTdW1tYXJ5ICA9IGZhbHNlXG5cbiAgdGhpcy5oYW5kID0ge1xuICAgICAgc2VhdHMgICAgOiBbXVxuICAgICwgcG9zdHMgICAgOiBbXVxuICAgICwgcHJlZmxvcCAgOiBbXVxuICAgICwgZmxvcCAgICAgOiBbXVxuICAgICwgdHVybiAgICAgOiBbXVxuICAgICwgcml2ZXIgICAgOiBbXVxuICAgICwgc2hvd2Rvd24gOiBbXVxuICAgICwgc3VtbWFyeSAgOiBbXVxuICB9XG5cbiAgLy8gc3RvcmFnZSB0byBwaWVjZSB0b2dldGhlciBwaWVjZXMgaW4gY29uc2lzdGVudCBvcmRlclxuICB0aGlzLl9yZXZlYWxlZENhcmRzID0ge31cbn1cblxudmFyIHByb3RvID0gSGFuZEhpc3RvcnlQYXJzZXIucHJvdG90eXBlXG4vLyBNZXRob2RzIHJldHVybmluZyB0aGUgcnggZm9yIGdpdmVuIGdhbWV0eXBlICh0b3VybmV5fGNhc2gpXG5wcm90by5faGFuZEluZm9SeCAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX3RhYmxlSW5mb1J4ICAgICAgICAgPSB1bmRlZmluZWRcblxuLy8gTWV0aG9kIHRoYXQgcmV0dXJucyBnYW1ldHlwZSBvZiBsb2FkZWQgaGFuZFxucHJvdG8uX2dhbWVUeXBlICAgICAgICAgICAgPSB1bmRlZmluZWRcblxuLy8gUmVnZXhlcyB0aGF0IG5lZWQgdG8gYmUgaW1wbGVtZW50ZWRcblxuLy8gSGFuZCBTZXR1cFxucHJvdG8uX3NlYXRJbmZvUnggICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9wb3N0UnggICAgICAgICAgICAgID0gdW5kZWZpbmVkXG5cbi8vIFN0cmVldCBJbmRpY2F0b3JzXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IHVuZGVmaW5lZFxucHJvdG8uX3N0cmVldEluZGljYXRvclJ4ICAgPSB1bmRlZmluZWRcbnByb3RvLl9zaG93ZG93bkluZGljYXRvclJ4ID0gdW5kZWZpbmVkXG5wcm90by5fc3VtbWFyeUluZGljYXRvclJ4ICA9IHVuZGVmaW5lZFxuXG4vLyBTdHJlZXQgYWN0aW9uc1xucHJvdG8uX2hvbGVjYXJkc1J4ICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9hY3Rpb25SeCAgICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fY29sbGVjdFJ4ICAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX2JldFJldHVybmVkUnggICAgICAgPSB1bmRlZmluZWRcblxuLy8gU2hvd2Rvd24gKGFsc28gdXNlcyBfY29sbGVjdFJ4IGFuZCBfYmV0UmV0dXJuZWRSeClcbnByb3RvLl9zaG93UnggICAgICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fbXVja1J4ICAgICAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX2ZpbmlzaFJ4ICAgICAgICAgICAgPSB1bmRlZmluZWRcblxuLy8gU3VtbWFyeVxucHJvdG8uX3N1bW1hcnlTaW5nbGVQb3RSeCAgPSB1bmRlZmluZWRcbnByb3RvLl9zdW1tYXJ5U3BsaXRQb3RSeCAgID0gdW5kZWZpbmVkXG5wcm90by5fc3VtbWFyeUJvYXJkUnggICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX3N1bW1hcnlNdWNrZWRSeCAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9zdW1tYXJ5Q29sbGVjdGVkUnggID0gdW5kZWZpbmVkXG5wcm90by5fc3VtbWFyeVNob3dlZFdvblJ4ICA9IHVuZGVmaW5lZFxucHJvdG8uX3N1bW1hcnlTaG93ZWRMb3N0UnggPSB1bmRlZmluZWRcbnByb3RvLl9zdW1tYXJ5Rm9sZGVkUnggICAgID0gdW5kZWZpbmVkXG5cbi8vIE9ubHkgYXBwbGllcyB0byBJZ25pdGlvbiBmb3Igbm93XG5wcm90by5fcmV2ZWFsUnggICAgICAgICAgICA9IHVuZGVmaW5lZFxuXG5wcm90by5fcHJlZmxvcEluZGljYXRvciA9IGZ1bmN0aW9uIF9wcmVmbG9wSW5kaWNhdG9yKGxpbmUsIGxpbmVubykge1xuICByZXR1cm4gdGhpcy5fcHJlZmxvcEluZGljYXRvclJ4LnRlc3QobGluZSlcbn1cblxucHJvdG8uX3Nob3dkb3duSW5kaWNhdG9yID0gZnVuY3Rpb24gX3Nob3dkb3duSW5kaWNhdG9yKGxpbmUsIGxpbmVubykge1xuICByZXR1cm4gdGhpcy5fc2hvd2Rvd25JbmRpY2F0b3JSeC50ZXN0KGxpbmUpXG59XG5cbnByb3RvLl9zdW1tYXJ5SW5kaWNhdG9yID0gIGZ1bmN0aW9uIF9zdW1tYXJ5SW5kaWNhdG9yKGxpbmUsIGxpbmVubykge1xuICByZXR1cm4gdGhpcy5fc3VtbWFyeUluZGljYXRvclJ4LnRlc3QobGluZSlcbn1cblxucHJvdG8uX2lkZW50aWZ5UG9rZXJUeXBlID0gZnVuY3Rpb24gX2lkZW50aWZ5UG9rZXJUeXBlKHMpIHtcbiAgaWYgKHR5cGVvZiBzID09PSAndW5kZWZpbmVkJykgcmV0dXJuIHVuZGVmaW5lZFxuICByZXR1cm4gICgvaG9sZCc/ZW0vaSkudGVzdChzKSA/ICdob2xkZW0nXG4gICAgICAgIDogKC9vbWFoYS9pKS50ZXN0KHMpICAgID8gJ29tYWhhJ1xuICAgICAgICA6ICdub3QgeWV0IHN1cHBvcnRlZCdcbn1cblxucHJvdG8uX2lkZW50aWZ5TGltaXQgPSBmdW5jdGlvbiBfaWRlbnRpZnlMaW1pdChzKSB7XG4gIGlmICh0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybiB1bmRlZmluZWRcblxuICByZXR1cm4gICgvKG5vID9saW1pdHxubCkvaSkudGVzdChzKSAgPyAnbm9saW1pdCdcbiAgICAgICAgOiAoLyhwb3QgP2xpbWl0fHBsKS9pKS50ZXN0KHMpID8gJ3BvdGxpbWl0J1xuICAgICAgICA6ICdub3QgeWV0IHN1cHBvcnRlZCdcbn1cblxucHJvdG8uX2lkZW50aWZ5U3VtbWFyeVBvc2l0aW9uID0gZnVuY3Rpb24gX2lkZW50aWZ5U3VtbWFyeVBvcyhzKSB7XG4gIGlmIChzID09IG51bGwpIHJldHVybiAnJ1xuICBjb25zdCBsb3dlciA9IHMudHJpbSgpLnRvTG93ZXJDYXNlKClcbiAgcmV0dXJuIChcbiAgICAgIGxvd2VyID09PSAnYnV0dG9uJyAgICAgID8gJ2J1J1xuICAgIDogbG93ZXIgPT09ICdiaWcgYmxpbmQnICAgPyAnYmInXG4gICAgOiBsb3dlciA9PT0gJ3NtYWxsIGJsaW5kJyA/ICdzYidcbiAgICA6ICd1bmtub3duJ1xuICApXG59XG5cbnByb3RvLl9yZWFkSW5mbyA9IGZ1bmN0aW9uIF9yZWFkSW5mbyhsaW5lLCBsaW5lbm8pIHtcbiAgbGluZSA9IHByaWNlRnJlZXJvbGwobGluZSlcbiAgY29uc3QgZ2FtZVR5cGUgICA9IHRoaXMuX2dhbWVUeXBlKClcbiAgY29uc3QgaGFuZEluZm8gICA9IHRoaXMuX2hhbmRJbmZvUngoZ2FtZVR5cGUpXG4gIGNvbnN0IGhhbmRJbmZvUnggPSBoYW5kSW5mby5yeFxuICBjb25zdCBpZHhzICAgICAgID0gaGFuZEluZm8uaWR4c1xuICBjb25zdCBtYXRjaCAgICAgID0gbGluZS5tYXRjaChoYW5kSW5mb1J4KVxuICBpZiAobWF0Y2ggPT0gbnVsbCkgcmV0dXJuXG5cbiAgY29uc3QgaW5mbyA9IHRoaXMuaGFuZC5pbmZvID0ge31cbiAgaWYgKGlkeHMucm9vbSAhPSBudWxsKSAgICAgIGluZm8ucm9vbSAgICAgID0gc2FmZUxvd2VyKG1hdGNoW2lkeHMucm9vbV0pXG4gIGlmIChpZHhzLmhhbmRpZCAhPSBudWxsKSAgICBpbmZvLmhhbmRpZCAgICA9IG1hdGNoW2lkeHMuaGFuZGlkXVxuICBpZiAoaWR4cy5jdXJyZW5jeSAhPSBudWxsKSAgaW5mby5jdXJyZW5jeSAgPSBtYXRjaFtpZHhzLmN1cnJlbmN5XVxuICBpZiAoaWR4cy5wb2tlcnR5cGUgIT0gbnVsbCkgaW5mby5wb2tlcnR5cGUgPSB0aGlzLl9pZGVudGlmeVBva2VyVHlwZShtYXRjaFtpZHhzLnBva2VydHlwZV0pXG4gIGlmIChpZHhzLmxpbWl0ICE9IG51bGwpICAgICBpbmZvLmxpbWl0ICAgICA9IHRoaXMuX2lkZW50aWZ5TGltaXQobWF0Y2hbaWR4cy5saW1pdF0pXG4gIGlmIChpZHhzLnNiICE9IG51bGwpICAgICAgICBpbmZvLnNiICAgICAgICA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeHMuc2JdKVxuICBpZiAoaWR4cy5iYiAhPSBudWxsKSAgICAgICAgaW5mby5iYiAgICAgICAgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHhzLmJiXSlcbiAgaWYgKGlkeHMueWVhciAhPSBudWxsKSAgICAgIGluZm8ueWVhciAgICAgID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMueWVhcl0pXG4gIGlmIChpZHhzLm1vbnRoICE9IG51bGwpICAgICBpbmZvLm1vbnRoICAgICA9IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLm1vbnRoXSlcbiAgaWYgKGlkeHMuZGF5ICE9IG51bGwpICAgICAgIGluZm8uZGF5ICAgICAgID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMuZGF5XSlcbiAgaWYgKGlkeHMuaG91ciAhPSBudWxsKSAgICAgIGluZm8uaG91ciAgICAgID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMuaG91cl0pXG4gIGlmIChpZHhzLm1pbiAhPSBudWxsKSAgICAgICBpbmZvLm1pbiAgICAgICA9IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLm1pbl0pXG4gIGlmIChpZHhzLnNlYyAhPSBudWxsKSAgICAgICBpbmZvLnNlYyAgICAgICA9IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLnNlY10pXG4gIGlmIChpZHhzLnRpbWV6b25lICE9IG51bGwpICBpbmZvLnRpbWV6b25lICA9IHNhZmVVcHBlcihtYXRjaFtpZHhzLnRpbWV6b25lXSlcbiAgaWYgKGlkeHMuZ2FtZW5vICE9IG51bGwpICAgIGluZm8uZ2FtZW5vICAgID0gbWF0Y2hbaWR4cy5nYW1lbm9dXG4gIGlmIChpZHhzLmxldmVsICE9IG51bGwpICAgICBpbmZvLmxldmVsICAgICA9IHNhZmVUcmltKHNhZmVMb3dlcihtYXRjaFtpZHhzLmxldmVsXSkpXG5cbiAgaW5mby5nYW1ldHlwZSA9IGdhbWVUeXBlXG4gIGluZm8ubWV0YWRhdGEgPSB7IGxpbmVubzogbGluZW5vLCByYXc6IGxpbmUgfVxuXG4gIGlmIChpZHhzLmRvbmF0aW9uICE9IG51bGwgJiYgaWR4cy5yYWtlICE9IG51bGwpIHtcbiAgICBjb25zdCBkb25hdGlvbiA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeHMuZG9uYXRpb25dKVxuICAgIGNvbnN0IHJha2UgICAgID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbaWR4cy5yYWtlXSlcblxuICAgIGluZm8uZG9uYXRpb24gID0gc2FmZVBhcnNlRmxvYXQoZG9uYXRpb24pXG4gICAgaW5mby5yYWtlICAgICAgPSBzYWZlUGFyc2VGbG9hdChyYWtlKVxuICAgIGluZm8uYnV5aW4gICAgID0gZG9uYXRpb24gKyByYWtlXG4gIH1cblxuICBpZiAoaWR4cy50YWJsZW5vICE9IG51bGwpIHtcbiAgICBjb25zdCB0YWJsZW5vICA9IGdhbWVUeXBlID09PSAndG91cm5hbWVudCdcbiAgICAgID8gc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMudGFibGVub10pXG4gICAgICA6IG1hdGNoW2lkeHMudGFibGVub11cbiAgICB0aGlzLmhhbmQudGFibGUgPSB7IHRhYmxlbm86IHRhYmxlbm8gfVxuICB9XG5cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRUYWJsZSA9IGZ1bmN0aW9uIF9yZWFkVGFibGUobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IGdhbWVUeXBlID0gdGhpcy5fZ2FtZVR5cGUoKVxuICBjb25zdCB0YWJsZSAgICA9IHRoaXMuX3RhYmxlUngoZ2FtZVR5cGUpXG4gIGlmICh0YWJsZSA9PSBudWxsKSByZXR1cm5cblxuICBjb25zdCB0YWJsZVJ4ICA9IHRhYmxlLnJ4XG4gIGNvbnN0IGlkeHMgICAgID0gdGFibGUuaWR4c1xuICBjb25zdCBtYXRjaCAgICA9IGxpbmUubWF0Y2godGFibGVSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgLy8gaW4gc29tZSBjYXNlcyB0aGUgdGFibGUgaW5mbyBzdGFydHMgZ2V0dGluZyBjb2xsZWN0ZWQgYXMgcGFydCBvZiBfcmVhZEluZm9cbiAgaWYgKHRoaXMuaGFuZC50YWJsZSA9PSBudWxsKSB0aGlzLmhhbmQudGFibGUgPSB7fVxuXG4gIGNvbnN0IGluZm8gPSB0aGlzLmhhbmQudGFibGVcbiAgaWYgKGlkeHMudGFibGVubyAhPSBudWxsKSB7XG4gICAgY29uc3QgdGFibGVubyAgPSBnYW1lVHlwZSA9PT0gJ3RvdXJuYW1lbnQnXG4gICAgICA/IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLnRhYmxlbm9dKVxuICAgICAgOiBtYXRjaFtpZHhzLnRhYmxlbm9dXG5cbiAgICBpbmZvLnRhYmxlbm8gPSB0YWJsZW5vXG4gIH1cbiAgaWYgKGlkeHMubWF4c2VhdHMgIT0gbnVsbCkgaW5mby5tYXhzZWF0cyA9IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLm1heHNlYXRzXSlcbiAgaWYgKGlkeHMuYnV0dG9uICE9IG51bGwpICAgaW5mby5idXR0b24gPSBzYWZlUGFyc2VJbnQobWF0Y2hbaWR4cy5idXR0b25dKVxuICBpbmZvLm1ldGFkYXRhID0geyBsaW5lbm86IGxpbmVubywgcmF3OiBsaW5lIH1cblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFNlYXQgPSBmdW5jdGlvbiBfcmVhZFNlYXQobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zZWF0SW5mb1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICB0aGlzLmhhbmQuc2VhdHMucHVzaCh7XG4gICAgICBzZWF0bm86IHNhZmVQYXJzZUludChtYXRjaFsxXSlcbiAgICAsIHBsYXllcjogc2FmZVRyaW0obWF0Y2hbMl0pXG4gICAgLCBjaGlwczogc2FmZVBhcnNlRmxvYXQobWF0Y2hbM10pXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH0pXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9wb3N0VHlwZSA9IGZ1bmN0aW9uIF9wb3N0VHlwZShzKSB7XG4gIGNvbnN0IGxvd2VyID0gcy50b0xvd2VyQ2FzZSgpXG4gIHJldHVybiAobG93ZXIgPT09ICdhbnRlJyB8fCBsb3dlciA9PT0gJ2FudGUgY2hpcCcpICA/ICdhbnRlJ1xuICAgICAgICA6IGxvd2VyID09PSAnYmlnIGJsaW5kJyAgICAgICAgICAgICAgICAgICAgICAgPyAnYmInXG4gICAgICAgIDogbG93ZXIgPT09ICdzbWFsbCBibGluZCcgICAgICAgICAgICAgICAgICAgICA/ICdzYidcbiAgICAgICAgOiAndW5rbm93bidcbn1cblxucHJvdG8uX3JlYWRQb3N0ID0gZnVuY3Rpb24gX3JlYWRQb3N0KGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fcG9zdFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCB0eXBlICAgPSB0aGlzLl9wb3N0VHlwZShtYXRjaFsyXSlcbiAgY29uc3QgYW1vdW50ID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbM10pXG5cbiAgdGhpcy5oYW5kLnBvc3RzLnB1c2goe1xuICAgICAgcGxheWVyOiBzYWZlVHJpbShtYXRjaFsxXSlcbiAgICAsIHR5cGU6IHR5cGVcbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH0pXG4gIGlmICh0eXBlID09PSAnYW50ZScgJiYgIXRoaXMuaGFuZC5pbmZvLmFudGUpIHRoaXMuaGFuZC5pbmZvLmFudGUgPSBhbW91bnRcbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3NldEhlcm9Ib2xlQ2FyZHMgPSBmdW5jdGlvbiBfc2V0SGVyb0hvbGVDYXJkcyhwbGF5ZXIsIGNhcmQxLCBjYXJkMiwgbGluZSwgbGluZW5vKSB7XG4gIHRoaXMuaGFuZC5oZXJvID0gc2FmZVRyaW0ocGxheWVyKVxuICB0aGlzLmhhbmQuaG9sZWNhcmRzID0ge1xuICAgICAgY2FyZDE6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKGNhcmQxKSlcbiAgICAsIGNhcmQyOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShjYXJkMikpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICAgIGNhcmQxOiB0aGlzLmhhbmQuaG9sZWNhcmRzLmNhcmQxXG4gICAgLCBjYXJkMjogdGhpcy5oYW5kLmhvbGVjYXJkcy5jYXJkMlxuICB9XG59XG5cbnByb3RvLl9yZWFkSG9sZUNhcmRzID0gZnVuY3Rpb24gX3JlYWRIb2xlQ2FyZHMobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9ob2xlY2FyZHNSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG4gIHRoaXMuX3NldEhlcm9Ib2xlQ2FyZHMobWF0Y2hbMV0sIG1hdGNoWzJdLCBtYXRjaFszXSwgbGluZSwgbGluZW5vKVxuICByZXR1cm4gdHJ1ZVxufVxuXG4vLyBvbmx5IGFwcGxpZXMgdG8gSWduaXRpb24gd2hpY2ggcmV2ZWFscyBhbGwgcGxheWVyJ3MgY2FyZHNcbnByb3RvLl9yZWFkUmV2ZWFsZWRDYXJkcyA9IGZ1bmN0aW9uIF9yZWFkUmV2ZWFsZWRDYXJkcyhsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3JldmVhbFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBwbGF5ZXIgPSBzYWZlVHJpbShtYXRjaFsxXSlcbiAgdmFyIGNhcmRzXG4gIGlmICgvXFxbTUVdJC8udGVzdChwbGF5ZXIpKSB7XG4gICAgY2FyZHMgPSB0aGlzLl9zZXRIZXJvSG9sZUNhcmRzKHBsYXllciwgbWF0Y2hbMl0sIG1hdGNoWzNdLCBsaW5lLCBsaW5lbm8pXG4gIH0gZWxzZSB7XG4gICAgY29uc3QgYWN0aW9uID0gc2hvd0FjdGlvbihtYXRjaCwgJ3JldmVhbCcsIGxpbmUsIGxpbmVubylcbiAgICBjYXJkcyA9IHsgY2FyZDE6IGFjdGlvbi5jYXJkMSwgY2FyZDI6IGFjdGlvbi5jYXJkMiB9XG4gICAgdGhpcy5oYW5kLnNob3dkb3duLnB1c2goYWN0aW9uKVxuICB9XG4gIC8vIFVzZSB0aGlzIGxhdGVyIHRvIGZpbGwgaW4gc2hvd2Rvd24gc2hvd3NcbiAgdGhpcy5fcmV2ZWFsZWRDYXJkc1twbGF5ZXJdID0gY2FyZHNcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFN0cmVldCA9IGZ1bmN0aW9uIF9yZWFkU3RyZWV0KGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc3RyZWV0SW5kaWNhdG9yUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIHRoaXMuaGFuZC5ib2FyZCA9IHtcbiAgICAgIGNhcmQxOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFsyXSkpXG4gICAgLCBjYXJkMjogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbM10pKVxuICAgICwgY2FyZDM6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzRdKSlcbiAgICAsIGNhcmQ0OiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFs1XSkpXG4gICAgLCBjYXJkNTogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNl0pKVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG4gIGlmIChtYXRjaFsxXSA9PT0gJ0ZMT1AnKSB0aGlzLl9zYXdGbG9wID0gdHJ1ZVxuICBpZiAobWF0Y2hbMV0gPT09ICdUVVJOJykge1xuICAgIHRoaXMuX3Nhd1R1cm4gPSB0cnVlXG4gICAgdGhpcy5oYW5kLmJvYXJkLmNhcmQ0ID0gdGhpcy5oYW5kLmJvYXJkLmNhcmQ1XG4gICAgdGhpcy5oYW5kLmJvYXJkLmNhcmQ1ID0gdW5kZWZpbmVkXG4gIH1cbiAgaWYgKG1hdGNoWzFdID09PSAnUklWRVInKSB0aGlzLl9zYXdSaXZlciA9IHRydWVcbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gc2hvd0FjdGlvbihtYXRjaCwgdHlwZSwgbGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBzYWZlVHJpbShtYXRjaFsxXSlcbiAgICAsIHR5cGUgICAgOiB0eXBlXG4gICAgLCBjYXJkMSAgIDogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgICwgY2FyZDIgICA6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICBpZiAobWF0Y2hbNF0gIT0gbnVsbCkgYWN0aW9uLmRlc2MgPSBtYXRjaFs0XVxuICByZXR1cm4gYWN0aW9uXG59XG5cbi8vXG4vLyBTaG93ZG93blxuLy9cbnByb3RvLl9yZWFkU2hvd2Rvd25TaG93ID0gIGZ1bmN0aW9uIF9yZWFkU2hvd2Rvd25TaG93KGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc2hvd1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBhY3Rpb24gPSBzaG93QWN0aW9uKG1hdGNoLCAnc2hvdycsIGxpbmUsIGxpbmVubylcbiAgdGhpcy5oYW5kLnNob3dkb3duLnB1c2goYWN0aW9uKVxuXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkU2hvd2Rvd25NdWNrID0gZnVuY3Rpb24gX3JlYWRTaG93ZG93bk11Y2sobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9tdWNrUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBzYWZlVHJpbShtYXRjaFsxXSlcbiAgICAsIHR5cGUgICAgOiAnbXVjaydcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICAvLyBJZ25pdGlvbiBwcm92aWRlcyB1cyBjYXJkcyBhbmQgYSBkZXNjcmlwdGlvblxuICBpZiAobWF0Y2hbMl0gIT0gbnVsbCAmJiBtYXRjaFszXSAhPSBudWxsKSB7XG4gICAgYWN0aW9uLmNhcmQxID0gc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgIGFjdGlvbi5jYXJkMiA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgfVxuICBpZiAobWF0Y2hbNF0gIT0gbnVsbCkgYWN0aW9uLmRlc2MgPSBzYWZlVHJpbShzYWZlTG93ZXIobWF0Y2hbNF0pKVxuXG4gIHRoaXMuaGFuZC5zaG93ZG93bi5wdXNoKGFjdGlvbilcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFNob3dkb3duRmluaXNoID0gIGZ1bmN0aW9uIF9yZWFkU2hvd2Rvd25GaW5pc2gobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9maW5pc2hSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IHNhZmVUcmltKG1hdGNoWzFdKVxuICAgICwgdHlwZSAgICA6ICdmaW5pc2gnXG4gICAgLCBwbGFjZSAgIDogc2FmZVBhcnNlSW50KG1hdGNoWzJdKSB8fCBudWxsXG4gICAgLCBhbW91bnQgIDogc2FmZVBhcnNlRmxvYXQobWF0Y2hbM10pIHx8IG51bGxcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICB0aGlzLmhhbmQuc2hvd2Rvd24ucHVzaChhY3Rpb24pXG5cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRTaG93ZG93biA9ICBmdW5jdGlvbiBfcmVhZFNob3dkb3duKGxpbmUsIGxpbmVubykge1xuICBpZiAodGhpcy5fcmVhZFNob3dkb3duU2hvdyhsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFNob3dkb3duTXVjayhsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFNob3dkb3duRmluaXNoKGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG4gIGlmICh0aGlzLl9yZWFkQ29sbGVjdChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy9cbi8vIFN1bW1hcnlcbi8vXG5wcm90by5fcmVhZFN1bW1hcnlTaW5nbGVQb3QgPSBmdW5jdGlvbiBfcmVhZFN1bW1hcnlTaW5nbGVQb3QobGluZSwgbGluZW5vKSB7XG4gIHZhciBpZHggPSAxXG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zdW1tYXJ5U2luZ2xlUG90UngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IGFtb3VudCA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgdHlwZTogJ3BvdCdcbiAgICAsIHNpbmdsZTogdHJ1ZVxuICAgICwgYW1vdW50OiBhbW91bnRcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICBpZiAobWF0Y2hbaWR4XSAhPSBudWxsKSBhY3Rpb24ucmFrZSA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeCsrXSlcblxuICB0aGlzLmhhbmQuc3VtbWFyeS5wdXNoKGFjdGlvbilcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFN1bW1hcnlTcGxpdFBvdCA9IGZ1bmN0aW9uIF9yZWFkU3VtbWFyeVNwbGl0UG90KGxpbmUsIGxpbmVubykge1xuICBpZiAodGhpcy5fc3VtbWFyeVNwbGl0UG90UnggPT0gbnVsbCkgcmV0dXJuIGZhbHNlXG4gIHZhciBpZHggPSAxXG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zdW1tYXJ5U3BsaXRQb3RSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3QgYW1vdW50ID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbaWR4KytdKVxuICBjb25zdCBtYWluICAgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IHNpZGUgICA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgdHlwZTogJ3BvdCdcbiAgICAsIHNpbmdsZTogZmFsc2VcbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAgLCBtYWluOiBtYWluXG4gICAgLCBzaWRlOiBzaWRlXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cblxuICBpZiAobWF0Y2hbaWR4XSAhPSBudWxsKSBhY3Rpb24ucmFrZSA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeCsrXSlcblxuICB0aGlzLmhhbmQuc3VtbWFyeS5wdXNoKGFjdGlvbilcbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRTdW1tYXJ5Qm9hcmQgPSBmdW5jdGlvbiBfcmVhZEJvYXJkKGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc3VtbWFyeUJvYXJkUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIHRoaXMuaGFuZC5ib2FyZCA9IHtcbiAgICAgIGNhcmQxOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFsxXSkpXG4gICAgLCBjYXJkMjogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgICwgY2FyZDM6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgICAsIGNhcmQ0OiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFs0XSkpXG4gICAgLCBjYXJkNTogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNV0pKVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG59XG5cbnByb3RvLl9yZWFkU3VtbWFyeU11Y2tlZCA9IGZ1bmN0aW9uIF9yZWFkU3VtbWFyeU11Y2tlZChsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlNdWNrZWRSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3Qgc2VhdG5vID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcGxheWVyID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3N1bW1hcnlJbmNsdWRlc1Bvc2l0aW9uXG4gICAgPyB0aGlzLl9pZGVudGlmeVN1bW1hcnlQb3NpdGlvbihtYXRjaFtpZHgrK10pXG4gICAgOiB0aGlzLl9wb3NpdGlvbkZyb20ocGxheWVyLCBzZWF0bm8pXG4gIGNvbnN0IGNhcmQxICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG4gIGNvbnN0IGNhcmQyICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG5cbiAgdGhpcy5oYW5kLnN1bW1hcnkucHVzaCh7XG4gICAgICB0eXBlOiAnbXVjaydcbiAgICAsIHNlYXRubzogc2VhdG5vXG4gICAgLCBwbGF5ZXI6IHBsYXllclxuICAgICwgcG9zaXRpb246IHBvc2l0aW9uXG4gICAgLCBjYXJkMTogY2FyZDFcbiAgICAsIGNhcmQyOiBjYXJkMlxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkU3VtbWFyeVNob3dlZFdvbiA9IGZ1bmN0aW9uIF9yZWFkU3VtbWFyeVNob3dlZFdvbihsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlTaG93ZWRXb25SeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3Qgc2VhdG5vID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcGxheWVyID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3N1bW1hcnlJbmNsdWRlc1Bvc2l0aW9uXG4gICAgPyB0aGlzLl9pZGVudGlmeVN1bW1hcnlQb3NpdGlvbihtYXRjaFtpZHgrK10pXG4gICAgOiB0aGlzLl9wb3NpdGlvbkZyb20ocGxheWVyLCBzZWF0bm8pXG4gIGNvbnN0IGNhcmQxICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG4gIGNvbnN0IGNhcmQyICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG4gIGNvbnN0IGFtb3VudCA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgZGVzY3JpcHRpb24gPSBzYWZlVHJpbShtYXRjaFtpZHgrK10pXG5cbiAgdGhpcy5oYW5kLnN1bW1hcnkucHVzaCh7XG4gICAgICB0eXBlOiAnc2hvd2VkJ1xuICAgICwgd29uOiB0cnVlXG4gICAgLCBzZWF0bm86IHNlYXRub1xuICAgICwgcGxheWVyOiBwbGF5ZXJcbiAgICAsIHBvc2l0aW9uOiBwb3NpdGlvblxuICAgICwgY2FyZDE6IGNhcmQxXG4gICAgLCBjYXJkMjogY2FyZDJcbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAgLCBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25cbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFN1bW1hcnlTaG93ZWRMb3N0ID0gZnVuY3Rpb24gX3JlYWRTdW1tYXJ5U2hvd2VkTG9zdChsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlTaG93ZWRMb3N0UngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IHNlYXRubyA9IHNhZmVQYXJzZUludChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IHBsYXllciA9IHNhZmVUcmltKG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcG9zaXRpb24gPSB0aGlzLl9zdW1tYXJ5SW5jbHVkZXNQb3NpdGlvblxuICAgID8gdGhpcy5faWRlbnRpZnlTdW1tYXJ5UG9zaXRpb24obWF0Y2hbaWR4KytdKVxuICAgIDogdGhpcy5fcG9zaXRpb25Gcm9tKHBsYXllciwgc2VhdG5vKVxuICBjb25zdCBjYXJkMSAgPSBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFtpZHgrK10pKVxuICBjb25zdCBjYXJkMiAgPSBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFtpZHgrK10pKVxuICBjb25zdCBkZXNjcmlwdGlvbiA9IHNhZmVUcmltKG1hdGNoW2lkeCsrXSlcblxuICB0aGlzLmhhbmQuc3VtbWFyeS5wdXNoKHtcbiAgICAgIHR5cGU6ICdzaG93ZWQnXG4gICAgLCB3b246IGZhbHNlXG4gICAgLCBzZWF0bm86IHNlYXRub1xuICAgICwgcGxheWVyOiBwbGF5ZXJcbiAgICAsIHBvc2l0aW9uOiBwb3NpdGlvblxuICAgICwgY2FyZDE6IGNhcmQxXG4gICAgLCBjYXJkMjogY2FyZDJcbiAgICAsIGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvblxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkU3VtbWFyeUZvbGRlZCA9IGZ1bmN0aW9uIF9yZWFkU3VtbWFyeUZvbGRlZChsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlGb2xkZWRSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3Qgc2VhdG5vID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcGxheWVyID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3N1bW1hcnlJbmNsdWRlc1Bvc2l0aW9uXG4gICAgPyB0aGlzLl9pZGVudGlmeVN1bW1hcnlQb3NpdGlvbihtYXRjaFtpZHgrK10pXG4gICAgOiB0aGlzLl9wb3NpdGlvbkZyb20ocGxheWVyLCBzZWF0bm8pXG5cbiAgY29uc3Qgc3RyZWV0SW5kaWNhdG9yID0gc2FmZUxvd2VyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG4gIGNvbnN0IHN0cmVldCA9IChcbiAgICAgIHN0cmVldEluZGljYXRvciA9PT0gJ2JlZm9yZSBmbG9wJyA/ICdwcmVmbG9wJ1xuICAgIDogc3RyZWV0SW5kaWNhdG9yID09PSAnYmVmb3JlIHRoZSBmbG9wJyA/ICdwcmVmbG9wJ1xuICAgIDogc3RyZWV0SW5kaWNhdG9yID09PSAnb24gdGhlIGZsb3AnID8gJ2Zsb3AnXG4gICAgOiBzdHJlZXRJbmRpY2F0b3IgPT09ICdvbiB0aGUgdHVybicgPyAndHVybidcbiAgICA6IHN0cmVldEluZGljYXRvciA9PT0gJ29uIHRoZSByaXZlcicgPyAncml2ZXInXG4gICAgOiAndW5rbm93bidcbiAgKVxuICBjb25zdCBiZXQgPSBtYXRjaFtpZHgrK10gPT0gbnVsbFxuXG4gIHRoaXMuaGFuZC5zdW1tYXJ5LnB1c2goe1xuICAgICAgdHlwZTogJ2ZvbGRlZCdcbiAgICAsIHNlYXRubzogc2VhdG5vXG4gICAgLCBwbGF5ZXI6IHBsYXllclxuICAgICwgcG9zaXRpb246IHBvc2l0aW9uXG4gICAgLCBzdHJlZXQ6IHN0cmVldFxuICAgICwgYmV0OiBiZXRcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFN1bW1hcnlDb2xsZWN0ZWQgPSBmdW5jdGlvbiBfcmVhZFN1bW1hcnlDb2xsZWN0ZWQobGluZSwgbGluZW5vKSB7XG4gIHZhciBpZHggPSAxXG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zdW1tYXJ5Q29sbGVjdGVkUngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IHNlYXRubyA9IHNhZmVQYXJzZUludChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IHBsYXllciA9IHNhZmVUcmltKG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcG9zaXRpb24gPSB0aGlzLl9zdW1tYXJ5SW5jbHVkZXNQb3NpdGlvblxuICAgID8gdGhpcy5faWRlbnRpZnlTdW1tYXJ5UG9zaXRpb24obWF0Y2hbaWR4KytdKVxuICAgIDogdGhpcy5fcG9zaXRpb25Gcm9tKHBsYXllciwgc2VhdG5vKVxuICBjb25zdCBhbW91bnQgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHgrK10pXG5cbiAgdGhpcy5oYW5kLnN1bW1hcnkucHVzaCh7XG4gICAgICB0eXBlOiAnY29sbGVjdGVkJ1xuICAgICwgc2VhdG5vOiBzZWF0bm9cbiAgICAsIHBsYXllcjogcGxheWVyXG4gICAgLCBwb3NpdGlvbjogcG9zaXRpb25cbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gdHJ1ZVxufVxuXG4vLyBBbGwgaW5mbyBpbiBzdW1tYXJ5IGlzIGFscmVhZHkgZW5jb2RlZCBpbiB0aGUgaGFuZCwgYnV0IHdlIHBhcnNlIGl0IG91dCBhbnl3YXlzIGluIG9yZGVyIHRvXG4vLyBwcm92aWRlIGFsbCB0aGUgaW5mbyB3ZSBuZWVkIHRvIHdyaXRlIHRoZSBlbnRpcmUgaGFuZCBoaXN0b3J5IGZyb20gdGhpcyBpbmZvLCBpLmUuIHdoZW5cbi8vIGNvbnZlcnRpbmcgZnJvbSBvbmUgc2l0ZSBmb3JtYXQgdG8gYW5vdGhlci5cbnByb3RvLl9yZWFkU3VtbWFyeSA9ICBmdW5jdGlvbiBfcmVhZFN1bW1hcnkobGluZSwgbGluZW5vKSB7XG4gIGlmICh0aGlzLl9yZWFkU3VtbWFyeVNpbmdsZVBvdChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFN1bW1hcnlTcGxpdFBvdChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFN1bW1hcnlCb2FyZChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFN1bW1hcnlNdWNrZWQobGluZSwgbGluZW5vKSkgcmV0dXJuIHRydWVcbiAgLy8gTG9zdCBjYXNlcyB3aWxsIGFsc28gbWF0Y2ggdGhlIHdvbiByZWdleCwgc28gdGhpcyBvcmRlciBpcyBpbXBvcnRhbnRcbiAgaWYgKHRoaXMuX3JlYWRTdW1tYXJ5U2hvd2VkTG9zdChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFN1bW1hcnlTaG93ZWRXb24obGluZSwgbGluZW5vKSkgcmV0dXJuIHRydWVcbiAgaWYgKHRoaXMuX3JlYWRTdW1tYXJ5Rm9sZGVkKGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG4gIGlmICh0aGlzLl9yZWFkU3VtbWFyeUNvbGxlY3RlZChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gYWN0aW9uVHlwZShzKSB7XG4gIHMgPSBzLnJlcGxhY2UoLyhlZHxzKSQvLCAnJykudG9Mb3dlckNhc2UoKVxuICAvLyBjb252ZXJ0ICdmb2xkKHRpbWVvdXQpJyB0byAnZm9sZCcgKElnbml0aW9uKVxuICBpZiAoL15mb2xkLy50ZXN0KHMpKSByZXR1cm4gJ2ZvbGQnXG4gIC8vIGNvbnZlcnQgICdBbGwtaW4ocmFpc2UpJyB0byAncmFpc2UnIChJZ25pdGlvbilcbiAgaWYgKC9hbGwtaW5cXChyYWlzZVxcKS8udGVzdChzKSkgcmV0dXJuICdyYWlzZSdcbiAgaWYgKC9hbGwtaW5cXChiZXRcXCkvLnRlc3QocykpIHJldHVybiAnYmV0J1xuICBpZiAoL2FsbC1pbi8udGVzdChzKSkgcmV0dXJuICdjYWxsJ1xuICByZXR1cm4gc1xufVxuXG5wcm90by5fcmVhZEFjdGlvbiA9IGZ1bmN0aW9uIF9yZWFkQWN0aW9uKGxpbmUsIGxpbmVubykge1xuICBpZiAodGhpcy5fcmVhZEJldFJldHVybmVkKGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG5cbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX2FjdGlvblJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm4gZmFsc2VcblxuICBjb25zdCB0eXBlID0gYWN0aW9uVHlwZShtYXRjaFsyXSlcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IHNhZmVUcmltKG1hdGNoWzFdKVxuICAgICwgdHlwZSAgICA6IHR5cGVcbiAgICAsIGFtb3VudCAgOiBzYWZlUGFyc2VGbG9hdChtYXRjaFszXSlcbiAgfVxuICBpZiAodHlwZSA9PT0gJ3JhaXNlJykge1xuICAgIGFjdGlvbi5yYWlzZVRvID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbNF0pXG4gICAgYWN0aW9uLmFsbGluID0gISFtYXRjaFs1XSB8fCAvYWxsLWluL2kudGVzdChtYXRjaFsyXSlcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnY2FsbCcgfHwgdHlwZSA9PT0gJ2JldCcpIHtcbiAgICBhY3Rpb24uYWxsaW4gPSAhIW1hdGNoWzVdIHx8IC9hbGwtaW4vaS50ZXN0KG1hdGNoWzJdKVxuICB9XG5cbiAgYWN0aW9uLm1ldGFkYXRhID0ge1xuICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAsIHJhdzogbGluZVxuICB9XG5cbiAgdGhpcy5fYWRkQWN0aW9uKGFjdGlvbiwgbGluZSwgbGluZW5vKVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZENvbGxlY3QgPSBmdW5jdGlvbiBfcmVhZENvbGxlY3QobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9jb2xsZWN0UngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBzYWZlVHJpbShtYXRjaFsxXSlcbiAgICAsIHR5cGUgICAgOiAnY29sbGVjdCdcbiAgICAsIGFtb3VudCAgOiBzYWZlUGFyc2VGbG9hdChtYXRjaFsyXSlcbiAgICAsIHBvdCAgICAgOiBzYWZlVHJpbShtYXRjaFszXSkgfHwgbnVsbFxuICB9XG4gIHRoaXMuX2FkZEFjdGlvbihhY3Rpb24sIGxpbmUsIGxpbmVubylcbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRCZXRSZXR1cm5lZCA9IGZ1bmN0aW9uIF9yZWFkQmV0UmV0dXJuZWQobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9iZXRSZXR1cm5lZFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm4gZmFsc2VcblxuICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICBwbGF5ZXIgIDogc2FmZVRyaW0obWF0Y2hbMl0pXG4gICAgLCB0eXBlICAgIDogJ2JldC1yZXR1cm5lZCdcbiAgICAsIGFtb3VudCAgOiBzYWZlUGFyc2VGbG9hdChtYXRjaFsxXSlcbiAgfVxuXG4gIHRoaXMuX2FkZEFjdGlvbihhY3Rpb24sIGxpbmUsIGxpbmVubylcbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX2FkZEFjdGlvbiA9IGZ1bmN0aW9uIF9hZGRBY3Rpb24oYWN0aW9uLCBsaW5lLCBsaW5lbm8pIHtcbiAgYWN0aW9uLm1ldGFkYXRhID0ge1xuICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAsIHJhdzogbGluZVxuICB9XG4gIGlmICh0aGlzLl9zYXdTaG93ZG93bikge1xuICAgIHRoaXMuaGFuZC5zaG93ZG93bi5wdXNoKGFjdGlvbilcbiAgfSBlbHNlIGlmICh0aGlzLl9zYXdSaXZlcikge1xuICAgIHRoaXMuaGFuZC5yaXZlci5wdXNoKGFjdGlvbilcbiAgfSBlbHNlIGlmICh0aGlzLl9zYXdUdXJuKSB7XG4gICAgdGhpcy5oYW5kLnR1cm4ucHVzaChhY3Rpb24pXG4gIH0gZWxzZSBpZiAodGhpcy5fc2F3RmxvcCkge1xuICAgIHRoaXMuaGFuZC5mbG9wLnB1c2goYWN0aW9uKVxuICB9IGVsc2Uge1xuICAgIHRoaXMuaGFuZC5wcmVmbG9wLnB1c2goYWN0aW9uKVxuICB9XG59XG5cbnByb3RvLnBhcnNlID0gZnVuY3Rpb24gcGFyc2UoKSB7XG4gIHRoaXMuX2NhY2hlZEdhbWVUeXBlID0gbnVsbFxuICBjb25zdCBsaW5lcyA9IHRoaXMuX2xpbmVzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBTdW1tYXJ5XG4gICAgaWYgKHRoaXMuX3Nhd1N1bW1hcnkpIHtcbiAgICAgIGlmICh0aGlzLl9yZWFkU3VtbWFyeShsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Nhd1N1bW1hcnkgPSB0aGlzLl9zdW1tYXJ5SW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1N1bW1hcnkpIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgLy8gU2hvd2Rvd25cbiAgICBpZiAodGhpcy5fc2F3U2hvd2Rvd24pIHtcbiAgICAgIGlmICh0aGlzLl9yZWFkU2hvd2Rvd24obGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9zYXdTaG93ZG93biA9IHRoaXMuX3Nob3dkb3duSW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1Nob3dkb3duKSB7XG4gICAgICAgIGlmICh0aGlzLl9ub3NlcGFyYXRlU2hvd2Rvd25MaW5lKSBpLS1cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcmVmbG9wXG4gICAgaWYgKHRoaXMuX3Nhd1ByZWZsb3ApIHtcbiAgICAgIGlmICghdGhpcy5fc2F3RmxvcCAmJiAhdGhpcy5oYW5kLmhvbGVjYXJkcykge1xuICAgICAgICBpZiAodGhpcy5fcmV2ZWFsUnggPT0gbnVsbCkge1xuICAgICAgICAgIGlmICh0aGlzLl9yZWFkSG9sZUNhcmRzKGxpbmVzW2ldLCBpKSkge1xuICAgICAgICAgICAgdGhpcy5fc2F3UHJlZmxvcCA9IHRydWVcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIG9ubHkgYXBwbGllcyB0byBJZ25pdGlvbiBmb3Igbm93XG4gICAgICAgICAgaWYgKHRoaXMuX3JldmVhbFJ4ICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9yZWFkUmV2ZWFsZWRDYXJkcyhsaW5lc1tpXSwgaSkpIHtcbiAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICAgIHdoaWxlICh0aGlzLl9yZWFkUmV2ZWFsZWRDYXJkcyhsaW5lc1tpXSwgaSkpIGkrK1xuICAgICAgICAgICAgICBpLS1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX3Nhd1ByZWZsb3AgPSB0cnVlXG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRmxvcCwgVHVybiwgUml2ZXJcbiAgICAgIGlmICh0aGlzLl9yZWFkU3RyZWV0KGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkQWN0aW9uKGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkQ29sbGVjdChsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Nhd1ByZWZsb3AgPSB0aGlzLl9wcmVmbG9wSW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1ByZWZsb3ApIGNvbnRpbnVlXG5cbiAgICAgIGlmICh0aGlzLl9yZWFkUG9zdChsaW5lc1tpXSwgaSkpIHtcbiAgICAgICAgdGhpcy5fcG9zdGVkID0gdHJ1ZVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghdGhpcy5fcG9zdGVkKSB7XG4gICAgICBpZiAodGhpcy5oYW5kLmluZm8gPT0gbnVsbCkge1xuICAgICAgICBpZiAodGhpcy5fcmVhZEluZm8obGluZXNbaV0sIGkpKSB7XG4gICAgICAgICAgLy8gaW4gc29tZSBjYXNlcyAocmlnaHQgbm93IG9ubHkgZm9yIHRlc3RzKSB3ZSBhcmUgb25seSBpbnRlcmVzdGVkXG4gICAgICAgICAgLy8gaW4gdGhlIHRvdXJuYW1lbnQgb3IgY2FzaCBnYW1lIGluZm8gKGkuZS4gdGhlIGZpcnN0IGxpbmUpXG4gICAgICAgICAgaWYgKHRoaXMuX2luZm9Pbmx5KSByZXR1cm4gdGhpcy5oYW5kLmluZm9cbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIXRoaXMuaGFuZC50YWJsZSkgIGlmICh0aGlzLl9yZWFkVGFibGUobGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgICAgaWYgKHRoaXMuX3JlYWRTZWF0KGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXMuaGFuZFxufVxuXG5wcm90by5jYW5QYXJzZSA9IGZ1bmN0aW9uIGNhblBhcnNlKCkge1xuICByZXR1cm4gdGhpcy5fZ2FtZVR5cGUoKSAhPSBudWxsXG59XG5cbm1vZHVsZS5leHBvcnRzID0gSGFuZEhpc3RvcnlQYXJzZXJcbiIsIid1c2Ugc3RyaWN0J1xuXG5jb25zdCBzdHJpbmdVdGlsICAgICA9IHJlcXVpcmUoJy4uL3V0aWwvc3RyaW5nJylcbmNvbnN0IHNhZmVQYXJzZUludCAgID0gc3RyaW5nVXRpbC5zYWZlUGFyc2VJbnRcbmNvbnN0IHNhZmVQYXJzZUZsb2F0ID0gc3RyaW5nVXRpbC5zYWZlUGFyc2VGbG9hdFxuY29uc3Qgc2FmZVRyaW0gICAgICAgPSBzdHJpbmdVdGlsLnNhZmVUcmltXG5jb25zdCBzYWZlTG93ZXIgICAgICA9IHN0cmluZ1V0aWwuc2FmZUxvd2VyXG5jb25zdCBzYWZlRmlyc3RVcHBlciA9IHN0cmluZ1V0aWwuc2FmZUZpcnN0VXBwZXJcblxuY29uc3QgaGVybyA9ICdJZ25pdGlvbkhlcm8nXG5jb25zdCBwcmVmaXggPSAnSWduaXRpb24tJ1xuXG4vLyBUb3VybmFtZW50XG4vLyBJZ25pdGlvbiBIYW5kICMzNTQ4MzIwODg3OiBIT0xERU0gVG91cm5hbWVudCAjMTg1MDkzMTMgVEJMIzEsXG4vLyBOb3JtYWwtIExldmVsIDEgKDEwLzIwKSAtIDIwMTctMDctMjEgMTM6NDg6MTVcblxuLy8gQ2FzaCBab25lIFBva2VyXG4vLyBJZ25pdGlvbiBIYW5kICMzMzcyNzYyNDYxICBab25lIFBva2VyIElEIzg3NSBIT0xERU1ab25lUG9rZXIgTm8gTGltaXQgLSAyMDE2LTEwLTE2IDEzOjU1OjM1XG4vLyBJdCBhcHBlYXJzIHRoYXQgQm92YWRhIGhhcyBhbiBpZGVudGljYWwgaGlzdG9yeSBmb3JtYXRcbmNvbnN0IHJvb21HYW1lSUQgPVxuICAvLyBJZ25pdGlvbiBIYW5kICMzNTQ4MzIwODg3OlxuICAnXihJZ25pdGlvbnxCb3ZhZGEpICg/OkhhbmR8R2FtZSkgIyhcXFxcZCspOj8gKydcblxuY29uc3QgcG9rZXJUeXBlID1cbiAgLy8gSE9MREVNXG4gICcoSE9MREVNKSArJ1xuXG5jb25zdCBjYXNoVGFibGVJRCA9XG4gICdab25lIFBva2VyIElEIyhbXiBdKykgJ1xuXG5jb25zdCBjYXNoUG9rZXJUeXBlTGltaXQgPVxuICAvLyBIT0xERU1ab25lUG9rZXIgTm8gTGltaXRcbiAgJyhIT0xERU0pKD86Wm9uZVBva2VyKT8gKyhObyBMaW1pdCknXG5cbmNvbnN0IHRvdXJuYW1lbnRJRCA9XG4gIC8vIFRvdXJuYW1lbnQgIzE4NTA5MzEzXG4gICdUb3VybmFtZW50ICMoXFxcXGQrKSArJ1xuXG5jb25zdCB0b3VybmFtZW50VGFibGUgPVxuICAnVEJMIyhcXFxcZCspLCArJ1xuXG5jb25zdCB0b3VybmFtZW50TGV2ZWwgPVxuICAvLyBMZXZlbCAxICgxMC8yMClcbiAgJyg/Ok5vcm1hbC0pPyBMZXZlbCAoW14oXSspXFxcXCgoW14vXSspLyhbXildKylcXFxcKSg/OiAtICl7MCwxfSdcblxuY29uc3QgZGF0ZSA9XG4gIC8vIDIwMTYtMDMtMDFcbiAgJ1teXFxcXGRdKihcXFxcZHs0fSkuKFxcXFxkezJ9KS4oXFxcXGR7Mn0pICsnXG5cbmNvbnN0IHRpbWUgPVxuICAvLyAxOjI5OjQxXG4gICdbXlxcXFxkXSooW146XSspOihbXjpdKyk6KFteIF0rKSguKyknXG5cbmNvbnN0IHRvdXJuYW1lbnRJbmZvID0gbmV3IFJlZ0V4cChcbiAgICByb29tR2FtZUlEXG4gICsgcG9rZXJUeXBlXG4gICsgdG91cm5hbWVudElEXG4gICsgdG91cm5hbWVudFRhYmxlXG4gICsgdG91cm5hbWVudExldmVsXG4gICsgZGF0ZVxuICArIHRpbWVcbiAgKyAnJCdcbilcblxuY29uc3QgdG91cm5hbWVudEluZm9JZHhzID0ge1xuICAgIHJvb20gICAgICA6IDFcbiAgLCBoYW5kaWQgICAgOiAyXG4gICwgcG9rZXJ0eXBlIDogM1xuICAsIGdhbWVubyAgICA6IDRcbiAgLCB0YWJsZW5vICAgOiA1XG4gICwgbGV2ZWwgICAgIDogNlxuICAsIHNiICAgICAgICA6IDdcbiAgLCBiYiAgICAgICAgOiA4XG4gICwgeWVhciAgICAgIDogOVxuICAsIG1vbnRoICAgICA6IDEwXG4gICwgZGF5ICAgICAgIDogMTFcbiAgLCBob3VyICAgICAgOiAxMlxuICAsIG1pbiAgICAgICA6IDEzXG4gICwgc2VjICAgICAgIDogMTRcbiAgLCB0aW1lem9uZSAgOiBudWxsXG4gICwgY3VycmVuY3kgIDogbnVsbFxuICAsIGRvbmF0aW9uICA6IG51bGxcbiAgLCByYWtlICAgICAgOiBudWxsXG4gICwgbGltaXQgICAgIDogbnVsbFxufVxuXG5jb25zdCBjYXNoR2FtZUluZm8gPSBuZXcgUmVnRXhwKFxuICAgIHJvb21HYW1lSURcbiAgKyBjYXNoVGFibGVJRFxuICArIGNhc2hQb2tlclR5cGVMaW1pdFxuICArIGRhdGVcbiAgKyB0aW1lXG4gICsgJyQnXG4pXG5cbmNvbnN0IGNhc2hHYW1lSW5mb0lkeHMgPSB7XG4gICAgcm9vbSAgICAgIDogMVxuICAsIGhhbmRpZCAgICA6IDJcbiAgLCB0YWJsZW5vICAgOiAzXG4gICwgcG9rZXJ0eXBlIDogNFxuICAsIGxpbWl0ICAgICA6IDVcbiAgLCB5ZWFyICAgICAgOiA2XG4gICwgbW9udGggICAgIDogN1xuICAsIGRheSAgICAgICA6IDhcbiAgLCBob3VyICAgICAgOiA5XG4gICwgbWluICAgICAgIDogMTBcbiAgLCBzZWMgICAgICAgOiAxMVxuICAsIHRpbWV6b25lICA6IG51bGxcbiAgLCBjdXJyZW5jeSAgOiBudWxsXG4gICwgc2IgICAgICAgIDogbnVsbFxuICAsIGJiICAgICAgICA6IG51bGxcbn1cblxuY29uc3QgSGFuZEhpc3RvcnlQYXJzZXIgPSByZXF1aXJlKCcuL2Jhc2UnKVxuXG5mdW5jdGlvbiBIb2xkZW1JZ25pdGlvblBhcnNlcihsaW5lcywgb3B0cykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSG9sZGVtSWduaXRpb25QYXJzZXIpKSByZXR1cm4gbmV3IEhvbGRlbUlnbml0aW9uUGFyc2VyKGxpbmVzLCBvcHRzKVxuICBIYW5kSGlzdG9yeVBhcnNlci5jYWxsKHRoaXMsIGxpbmVzLCBvcHRzKVxufVxuXG5Ib2xkZW1JZ25pdGlvblBhcnNlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEhhbmRIaXN0b3J5UGFyc2VyLnByb3RvdHlwZSlcbkhvbGRlbUlnbml0aW9uUGFyc2VyLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IEhvbGRlbUlnbml0aW9uUGFyc2VyXG5jb25zdCBwcm90byA9IEhvbGRlbUlnbml0aW9uUGFyc2VyLnByb3RvdHlwZVxuXG5wcm90by5faGFuZEluZm9SeCA9IGZ1bmN0aW9uIF9oYW5kSW5mb1J4KGdhbWVUeXBlKSB7XG4gIHN3aXRjaCAoZ2FtZVR5cGUudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ3RvdXJuYW1lbnQnOiByZXR1cm4geyByeDogdG91cm5hbWVudEluZm8sIGlkeHM6IHRvdXJuYW1lbnRJbmZvSWR4cyB9XG4gICAgY2FzZSAnY2FzaGdhbWUnOiByZXR1cm4geyByeDogY2FzaEdhbWVJbmZvLCBpZHhzOiBjYXNoR2FtZUluZm9JZHhzIH1cbiAgICBkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZ2FtZSB0eXBlICcgKyBnYW1lVHlwZSlcbiAgfVxufVxuXG5wcm90by5fdGFibGVSeCA9IGZ1bmN0aW9uIF90YWJsZVJ4KGdhbWVUeXBlKSB7XG4gIC8vIElnbml0aW9uIGRvZXNuJ3QgaGF2ZSB0aGUgZXh0cmEgbGluZSBkZXNjcmliaW5nIHRoZSB0YWJsZVxuICAvLyBhbGwgaW5mbyBpcyBpbmNsdWRlZCBpbiB0aGUgZmlyc3QgbGluZS5cbiAgcmV0dXJuIG51bGxcbn1cblxuLy8gSGFuZCBTZXR1cFxucHJvdG8uX3NlYXRJbmZvUnggICAgICAgICAgPSAvXlNlYXQgKFxcZCspOiAoLispXFwoWyR84oKsXT8oW14gXSspIGluIGNoaXBzKD86LCAuKz8gYm91bnR5KT9cXCkoIC4rc2l0dGluZyBvdXQpPyQvaVxucHJvdG8uX3Bvc3RSeCAgICAgICAgICAgICAgPSAvXihbXjpdKyk6IChBbnRlIGNoaXB8U21hbGwgYmxpbmR8QmlnIGJsaW5kKSBbJHzigqxdPyhbXiBdKykkL2kgLy8gQmlnIEJsaW5kIDogQmlnIGJsaW5kIDIwXG5cbi8vIFN0cmVldCBJbmRpY2F0b3JzXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IC9eXFwqXFwqXFwqIEhPTEUgQ0FSRFMgXFwqXFwqXFwqJC9pXG5wcm90by5fc3RyZWV0SW5kaWNhdG9yUnggICA9IC9eXFwqXFwqXFwqIChGTE9QfFRVUk58UklWRVIpIFxcKlxcKlxcKlteW10rXFxbKC4uKSAoLi4pICguLikoPzogKC4uKSk/XSg/OiBcXFsoLi4pXSk/JC9pXG5wcm90by5fbm9zZXBhcmF0ZVNob3dkb3duTGluZSA9IHRydWVcbnByb3RvLl9zdW1tYXJ5SW5kaWNhdG9yUnggID0gL15cXCpcXCpcXCogU1VNTUFSWSBcXCpcXCpcXCokL2lcblxuLy8gU3RyZWV0IGFjdGlvbnNcbnByb3RvLl9ob2xlY2FyZHNSeCAgICAgICAgID0gL14oW146XSspIDogQ2FyZCBkZWFsdCB0byBhIHNwb3QgXFxbKC4uKSAoLi4pXSQvaVxucHJvdG8uX2FjdGlvblJ4ICAgICAgICAgICAgPSAvXihbXjpdKykgOiAocmFpc2VzfEFsbC1pblxcKHJhaXNlXFwpfGJldHN8QWxsLWluXFwoYmV0XFwpfGNhbGx8QWxsLWlufGNoZWNrc3xmb2xkcyg/OlxcKHRpbWVvdXRcXCkpPykgP1skfOKCrF0/KFteIF0rKT8oPzogdG8gWyR84oKsXT8oW14gXSspKT8oLithbGwtaW4pPyQvaVxucHJvdG8uX2NvbGxlY3RSeCAgICAgICAgICAgPSAvXihbXjpdKykgOiBIYW5kIFJlc3VsdCg/Oi1TaWRlIFBvdCk/ICpbJHzigqxdPyhbXiBdKykkL2lcbnByb3RvLl9iZXRSZXR1cm5lZFJ4ICAgICAgID0gL14oW146XSspIDogUmV0dXJuIHVuY2FsbGVkIHBvcnRpb24gb2YgYmV0IFsoXT9bJHzigqxdPyhbXiApXSspWyldPyQvaVxuXG4vLyBTaG93ZG93biAoYWxzbyB1c2VzIF9jb2xsZWN0UnggYW5kIF9iZXRSZXR1cm5lZFJ4KVxucHJvdG8uX3Nob3dSeCAgICAgICAgICAgICAgPSAvXihbXjpdKykgOiBTaG93ZG93biAqKD86XFxbKD86Li4pK10pPyAqXFwoKFteKV0rKVxcKSQvaVxuLy8gJ0RvZXMgbm90IHNob3cnIHNlZW1zIHRvIHNob3cgdXAgb25seSB3aGVuIHRoZXJlIGlzIG5vIHNob3dkb3duXG4vLyBUaGVyZWZvcmUgdGVjaG5pY2FsbHkgaXQgaXMgbm8gbXVjayBhbmQgc2luY2Ugd2UgcmV2ZWFsIGFsbCBjYXJkcyBhbnl3YXlzIHdlIGlnbm9yZSB0aGF0IGNhc2UuXG5wcm90by5fbXVja1J4ICAgICAgICAgICAgICA9IC9eKFteOl0rKSA6ICg/OkRvZXMgbm90IHNob3d8TXVja3MpIFxcWyguLikgKC4uKV0gXFwoKFteKV0rKVxcKSQvaVxuLy8gQmVsb3cgc3Vic3RpdHV0ZSBmb3IgX2ZpbmlzaFJ4XG5wcm90by5fZmluaXNoUGxhY2VSeCAgICAgICA9IC9eKFteOl0rKSA6IFJhbmtpbmcgKFxcZCspJC9pXG5wcm90by5fZmluaXNoQW1vdW50UnggICAgICA9IC9eKFteOl0rKSA6IFByaXplIENhc2ggXFxbKFskfOKCrF0pKFteXFxdXSspXSQvaVxuXG4vLyBTdW1tYXJ5XG4vLyBJZ25pdGlvbiBvbmx5IHNob3dzIHRvdGFsIHBvdCBoZXJlIGFuZCBuZXZlciByYWtlLlxuLy8gVGhlIGluZm8gYWJvdXQgd2hldGhlciB0aGUgcG90IHdhcyBzcGxpdCBhbmQvb3IgaWYgdGhlcmUgd2FzIGEgc2lkZSBwb3QgaXMgb25seVxuLy8gZW5jb2RlZCBpbiB0aGUgY29sbGVjdCAoSGFuZCBSZXN1bHQpLiBGb3Igbm93IHdlIGp1c3QgY3JlYXRlIHR3byBjb2xsZWN0aW9ucyBmb3Jcbi8vIHNhbWUgb3Bwb25lbnQgaW4gY2FzZSBoZSBjb2xsZWN0cyBzaWRlIHBvdCArIG1haW4gcG90LlxuLy8gV2UgaWdub3JlIHRoZSBpbmZvIGluIHRoZSBzdW1tYXJ5IHVudGlsIGl0IGlzIHByb3ZlbiB0aGF0IHdlIHJlYWxseSBuZWVkIHRvIHByb3ZpZGVcbi8vIGl0IGZvciBzcGVjaWZpYyB0b29scyB0byB3b3JrIHByb3Blcmx5LlxucHJvdG8uX3N1bW1hcnlTaW5nbGVQb3RSeCAgPSAvXlRvdGFsIFBvdFxcKChbJHzigqxdKT8oW14gXSspXFwpJC9pXG5wcm90by5fc3VtbWFyeVNwbGl0UG90UnggICA9IG51bGxcbnByb3RvLl9zdW1tYXJ5Qm9hcmRSeCAgICAgID0gL15Cb2FyZCBcXFsoLi4pPyggLi4pPyggLi4pPyggLi4pPyggLi4pPyAqXSQvaVxucHJvdG8uX3N1bW1hcnlNdWNrZWRSeCAgICAgPSAvXlNlYXRcXCsoW146XSspOiAoLis/KSBcXFtNdWNrZWRdIFxcWyguLikgKC4uKSArXSQvaVxucHJvdG8uX3N1bW1hcnlDb2xsZWN0ZWRSeCAgPSAvXlNlYXRcXCsoW146XSspOiAoLis/KSBbJHzigqxdPyhbXiBdKykgK1xcW0RvZXMgbm90IHNob3ddJC9pXG5wcm90by5fc3VtbWFyeVNob3dlZFdvblJ4ICA9IC9eU2VhdFxcKyhbXjpdKyk6ICguKz8pIFskfOKCrF0/KFteIF0rKSArd2l0aCAoW15bXSspIFxcWyguLikgKC4uKS4qXSQvaVxucHJvdG8uX3N1bW1hcnlTaG93ZWRMb3N0UnggPSAvXlNlYXRcXCsoW146XSspOiAoLis/KSAoPzpsb3NlfGxvc3QpICt3aXRoIChbXltdKykgXFxbKC4uKSAoLi4pLipdJC9pXG5wcm90by5fc3VtbWFyeUZvbGRlZFJ4ICAgICA9IC9eU2VhdFxcKyhbXjpdKyk6ICguKz8pIEZvbGRlZCAoYmVmb3JlICg/OnRoZSApP0Zsb3B8b24gdGhlIEZsb3B8b24gdGhlIFR1cm58b24gdGhlIFJpdmVyKSQvaVxuXG5wcm90by5fcmV2ZWFsUnggICAgICAgICAgICA9IC9eKFteOl0rKSA6IENhcmQgZGVhbHQgdG8gYSBzcG90IFxcWyguLikgKC4uKV0kL2lcblxuLy8gQG92ZXJyaWRlXG4vLyBpbXBsZW1lbnRlZCBpbiBiYXNlIGJ1dCBvcmRlciBvZiBtYXRjaGVzIHJldmVyc2VkIGZyb20gZGVmYXVsdFxucHJvdG8uX3JlYWRCZXRSZXR1cm5lZCA9IGZ1bmN0aW9uIF9yZWFkQmV0UmV0dXJuZWQobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9iZXRSZXR1cm5lZFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm4gZmFsc2VcblxuICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICBwbGF5ZXIgIDogbWF0Y2hbMV1cbiAgICAsIHR5cGUgICAgOiAnYmV0LXJldHVybmVkJ1xuICAgICwgYW1vdW50ICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzJdKVxuICB9XG5cbiAgdGhpcy5fYWRkQWN0aW9uKGFjdGlvbiwgbGluZSwgbGluZW5vKVxuICByZXR1cm4gdHJ1ZVxufVxuXG4vL1xuLy8gU2hvd2Rvd25cbi8vXG5cbi8vIEBvdmVycmlkZVxucHJvdG8uX3Nob3dkb3duSW5kaWNhdG9yID0gZnVuY3Rpb24gX3Nob3dkb3duSW5kaWNhdG9yKGxpbmUsIGxpbmVubykge1xuICByZXR1cm4gdGhpcy5fc2hvd1J4LnRlc3QobGluZSlcbn1cblxucHJvdG8uX3JlYWRTaG93ZG93bkZpbmlzaFBsYWNlID0gIGZ1bmN0aW9uIF9yZWFkU2hvd2Rvd25GaW5pc2hQbGFjZShsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX2ZpbmlzaFBsYWNlUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBzYWZlVHJpbShtYXRjaFsxXSlcbiAgICAsIHR5cGUgICAgOiAnZmluaXNoJ1xuICAgICwgcGxhY2UgICA6IHNhZmVQYXJzZUludChtYXRjaFsyXSkgfHwgbnVsbFxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG4gIHRoaXMuaGFuZC5zaG93ZG93bi5wdXNoKGFjdGlvbilcbiAgLy8gaG9sZCBvbiB0byB0aGlzIHNvIHdlIGNhbiBhZGQgdGhlIHByaXplIChhbW91bnQpIHdvbiB3aGljaCBpcyBnaXZlbiBvbiBuZXh0IGxpbmVcbiAgdGhpcy5fbGFzdEZpbmlzaCA9IGFjdGlvblxuXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkU2hvd2Rvd25GaW5pc2hBbW91bnQgPSAgZnVuY3Rpb24gX3JlYWRTaG93ZG93bkZpbmlzaEFtb3VudChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX2ZpbmlzaEFtb3VudFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBwbGF5ZXIgPSBzYWZlVHJpbShtYXRjaFsxXSlcblxuICAvLyBtYXRjaGVkIGJ1dCBubyBpZGVhIHdoZXJlIGl0IGJlbG9uZ3NcbiAgaWYgKHRoaXMuX2xhc3RGaW5pc2gucGxheWVyICE9PSBwbGF5ZXIpIHJldHVybiB0cnVlXG5cbiAgLy8gSWduaXRpb24gZG9lc24ndCBnaXZlIHVzIHRoZSBjdXJyZW5jeSBpbiB0aGUgaGVhZCwgc28gd2UgZmlsbCBpdCBpbiB3aGVuIHdlXG4gIC8vIGNhbiwgbGlrZSBoZXJlXG4gIGlmICh0aGlzLmhhbmQuaW5mbyAhPSBudWxsICYmIHRoaXMuaGFuZC5pbmZvLmN1cnJlbmN5ID09IG51bGwpIHtcbiAgICB0aGlzLmhhbmQuaW5mby5jdXJyZW5jeSA9IHNhZmVUcmltKG1hdGNoWzJdKVxuICB9XG4gIHRoaXMuX2xhc3RGaW5pc2guYW1vdW50ID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbM10pXG4gIHRoaXMuX2xhc3RGaW5pc2gubWV0YWRhdGEucmF3ID0gdGhpcy5fbGFzdEZpbmlzaC5tZXRhZGF0YS5yYXcgKyAnXFxuJyArIGxpbmVcblxuICByZXR1cm4gdHJ1ZVxufVxuXG4vLyBAb3ZlcnJpZGVcbnByb3RvLl9yZWFkU2hvd2Rvd25TaG93ID0gIGZ1bmN0aW9uIF9yZWFkU2hvd2Rvd25TaG93KGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc2hvd1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICAvLyBDYXJkcyBhcmVuJ3Qga25vd24gaGVyZSBzaW5jZSBJZ25pdGlvbiBzaG93cyBmdWxsIGJvYXJkIHVzZWQgZm9yIGJlc3QgaGFuZFxuICAvLyBIb3dldmVyIHNpbmNlIGFsbCBjYXJkcyBhcmUgcmV2ZWFsZWQgd2UgY2FuIGZpbGwgdGhvc2UgaW4gYWZ0ZXIgd2UgcmVhZCB0aGVcbiAgLy8gd2hvbGUgaGFuZC5cbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IHNhZmVUcmltKG1hdGNoWzFdKVxuICAgICwgdHlwZSAgICA6ICdzaG93J1xuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG4gIGlmIChtYXRjaFsyXSAhPSBudWxsKSBhY3Rpb24uZGVzYyA9IHNhZmVUcmltKHNhZmVMb3dlcihtYXRjaFsyXSkpXG4gIHRoaXMuaGFuZC5zaG93ZG93bi5wdXNoKGFjdGlvbilcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcG9zaXRpb25Gcm9tID0gZnVuY3Rpb24gX3Bvc2l0aW9uRnJvbShwbGF5ZXIsIHNlYXRubykge1xuICBpZiAocGxheWVyID09IG51bGwpIHJldHVybiAnJ1xuICBjb25zdCBsb3dlciA9IHBsYXllci50b0xvd2VyQ2FzZSgpXG4gIHJldHVybiAoXG4gICAgICBsb3dlciA9PT0gJ2RlYWxlcicgICAgICA/ICdidSdcbiAgICA6IGxvd2VyID09PSAnc21hbGwgYmxpbmQnID8gJ3NiJ1xuICAgIDogbG93ZXIgPT09ICdiaWcgYmxpbmQnICAgPyAnYmInXG4gICAgOiAnJ1xuICApXG59XG5cbi8vIEBvdmVycmlkZVxucHJvdG8uX3JlYWRTaG93ZG93biA9IGZ1bmN0aW9uIF9yZWFkU2hvd2Rvd24obGluZSwgbGluZW5vKSB7XG4gIGlmICh0aGlzLl9yZWFkU2hvd2Rvd25TaG93KGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG4gIGlmICh0aGlzLl9yZWFkU2hvd2Rvd25NdWNrKGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG4gIGlmICh0aGlzLl9yZWFkU2hvd2Rvd25GaW5pc2hQbGFjZShsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICBpZiAodGhpcy5fcmVhZFNob3dkb3duRmluaXNoQW1vdW50KGxpbmUsIGxpbmVubykpIHJldHVybiB0cnVlXG4gIGlmICh0aGlzLl9yZWFkQ29sbGVjdChsaW5lLCBsaW5lbm8pKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy9cbi8vIFN1bW1hcnlcbi8vXG5cbi8vIEBvdmVycmlkZVxucHJvdG8uX3JlYWRTdW1tYXJ5U2luZ2xlUG90ID0gZnVuY3Rpb24gX3JlYWRTdW1tYXJ5U2luZ2xlUG90KGxpbmUsIGxpbmVubykge1xuICAvLyBvdmVycmlkZGVuIHRvIGNhcHR1cmUgY2FzaGNhbWUgY3VycmVuY3kgaW4gb25lIHBsYWNlXG4gIHZhciBpZHggPSAxXG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zdW1tYXJ5U2luZ2xlUG90UngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IGN1cnJlbmN5ID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBhbW91bnQgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHR5cGU6ICdwb3QnXG4gICAgLCBzaW5nbGU6IHRydWVcbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgdGhpcy5oYW5kLnN1bW1hcnkucHVzaChhY3Rpb24pXG5cbiAgaWYgKHRoaXMuaGFuZC5pbmZvICE9IG51bGwgJiZcbiAgICAgIHRoaXMuaGFuZC5pbmZvLmN1cnJlbmN5ID09IG51bGwgJiZcbiAgICAgIGN1cnJlbmN5ICE9IG51bGwpIHtcbiAgICB0aGlzLmhhbmQuaW5mby5jdXJyZW5jeSA9IGN1cnJlbmN5XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuLy8gQG92ZXJyaWRlXG5wcm90by5fcmVhZFN1bW1hcnlTaG93ZWRMb3N0ID0gZnVuY3Rpb24gX3JlYWRTdW1tYXJ5U2hvd2VkTG9zdChsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlTaG93ZWRMb3N0UngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IHNlYXRubyA9IHNhZmVQYXJzZUludChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IHBsYXllciA9IHNhZmVUcmltKG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgZGVzY3JpcHRpb24gPSBzYWZlVHJpbShtYXRjaFtpZHgrK10pXG4gIGNvbnN0IGNhcmQxICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG4gIGNvbnN0IGNhcmQyICA9IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoW2lkeCsrXSkpXG5cbiAgY29uc3QgcG9zaXRpb24gPSB0aGlzLl9wb3NpdGlvbkZyb20ocGxheWVyLCBzZWF0bm8pXG5cbiAgdGhpcy5oYW5kLnN1bW1hcnkucHVzaCh7XG4gICAgICB0eXBlOiAnc2hvd2VkJ1xuICAgICwgd29uOiBmYWxzZVxuICAgICwgc2VhdG5vOiBzZWF0bm9cbiAgICAsIHBsYXllcjogcGxheWVyXG4gICAgLCBwb3NpdGlvbjogcG9zaXRpb25cbiAgICAsIGNhcmQxOiBjYXJkMVxuICAgICwgY2FyZDI6IGNhcmQyXG4gICAgLCBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25cbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gdHJ1ZVxufVxuXG4vLyBAb3ZlcnJpZGVcbnByb3RvLl9yZWFkU3VtbWFyeVNob3dlZFdvbiA9IGZ1bmN0aW9uIF9yZWFkU3VtbWFyeVNob3dlZFdvbihsaW5lLCBsaW5lbm8pIHtcbiAgdmFyIGlkeCA9IDFcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N1bW1hcnlTaG93ZWRXb25SeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3Qgc2VhdG5vID0gc2FmZVBhcnNlSW50KG1hdGNoW2lkeCsrXSlcbiAgY29uc3QgcGxheWVyID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBhbW91bnQgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHgrK10pXG4gIGNvbnN0IGRlc2NyaXB0aW9uID0gc2FmZVRyaW0obWF0Y2hbaWR4KytdKVxuICBjb25zdCBjYXJkMSAgPSBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFtpZHgrK10pKVxuICBjb25zdCBjYXJkMiAgPSBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFtpZHgrK10pKVxuXG4gIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fcG9zaXRpb25Gcm9tKHBsYXllciwgc2VhdG5vKVxuXG4gIHRoaXMuaGFuZC5zdW1tYXJ5LnB1c2goe1xuICAgICAgdHlwZTogJ3Nob3dlZCdcbiAgICAsIHdvbjogdHJ1ZVxuICAgICwgc2VhdG5vOiBzZWF0bm9cbiAgICAsIHBsYXllcjogcGxheWVyXG4gICAgLCBwb3NpdGlvbjogcG9zaXRpb25cbiAgICAsIGNhcmQxOiBjYXJkMVxuICAgICwgY2FyZDI6IGNhcmQyXG4gICAgLCBhbW91bnQ6IGFtb3VudFxuICAgICwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH0pXG5cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX2dhbWVUeXBlID0gZnVuY3Rpb24gX2dhbWVUeXBlKCkge1xuICBpZiAodGhpcy5fY2FjaGVkR2FtZVR5cGUpIHJldHVybiB0aGlzLl9jYWNoZWRHYW1lVHlwZVxuICBjb25zdCBsaW5lcyA9IHRoaXMuX2xpbmVzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHRvdXJuYW1lbnRJbmZvLnRlc3QobGluZXNbaV0pKSB7XG4gICAgICB0aGlzLl9jYWNoZWRHYW1lVHlwZSA9ICd0b3VybmFtZW50J1xuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZEdhbWVUeXBlXG4gICAgfVxuICAgIGlmIChjYXNoR2FtZUluZm8udGVzdChsaW5lc1tpXSkpIHtcbiAgICAgIHRoaXMuX2NhY2hlZEdhbWVUeXBlID0gJ2Nhc2hnYW1lJ1xuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZEdhbWVUeXBlXG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsXG59XG5cbmZ1bmN0aW9uIGNvcnJlY3RIZXJvUGxheWVyKHgpIHtcbiAgY29uc3QgY3VycmVudEhlcm8gPSB0aGlzLmN1cnJlbnRIZXJvXG4gIGNvbnN0IGN1cnJlbnRIZXJvTm9NZSA9IHRoaXMuY3VycmVudEhlcm9Ob01lXG4gIGlmICh4LnBsYXllciA9PT0gY3VycmVudEhlcm8pIHgucGxheWVyID0gaGVyb1xuICBpZiAoeC5wbGF5ZXIgPT09IGN1cnJlbnRIZXJvTm9NZSkgeC5wbGF5ZXIgPSBoZXJvXG59XG5cbmZ1bmN0aW9uIGNvcnJlY3RIZXJvTmFtZShoYW5kKSB7XG4gIC8vIFdlIGRvbid0IGNvbmRlbnNlIHRoaXMgd2l0aCB0aGUgb3RoZXIgcGxheWVyIG5hbWUgYWRqdXN0bWVudFxuICAvLyBhcyBnZXR0aW5nIGEgY29uc2lzdGVudCBuYW1lIGZvciBoZXJvIGZpcnN0IGlzIG1ha2VzIHRoaW5ncyBlYXNpZXIuXG4gIGNvbnN0IGN1cnJlbnRIZXJvID0gaGFuZC5oZXJvXG4gIGNvbnN0IGN0eCA9IHtcbiAgICAgIGN1cnJlbnRIZXJvOiBjdXJyZW50SGVyb1xuICAgICAgLy8gSW4gc3VtbWFyeSB0aGUgJ1tNRV0nIHBvcnRpb24gaXMgZHJvcHBlZCA6KFxuICAgICwgY3VycmVudEhlcm9Ob01lOiBjdXJyZW50SGVyby5yZXBsYWNlKC8gK1xcW01FXSAqJC8sICcnKVxuICB9XG5cbiAgaGFuZC5zZWF0cy5mb3JFYWNoKGNvcnJlY3RIZXJvUGxheWVyLCBjdHgpXG4gIGhhbmQucG9zdHMuZm9yRWFjaChjb3JyZWN0SGVyb1BsYXllciwgY3R4KVxuICBoYW5kLnByZWZsb3AuZm9yRWFjaChjb3JyZWN0SGVyb1BsYXllciwgY3R4KVxuICBoYW5kLmZsb3AuZm9yRWFjaChjb3JyZWN0SGVyb1BsYXllciwgY3R4KVxuICBoYW5kLnR1cm4uZm9yRWFjaChjb3JyZWN0SGVyb1BsYXllciwgY3R4KVxuICBoYW5kLnJpdmVyLmZvckVhY2goY29ycmVjdEhlcm9QbGF5ZXIsIGN0eClcbiAgaGFuZC5zaG93ZG93bi5mb3JFYWNoKGNvcnJlY3RIZXJvUGxheWVyLCBjdHgpXG4gIGhhbmQuc3VtbWFyeS5mb3JFYWNoKGNvcnJlY3RIZXJvUGxheWVyLCBjdHgpXG4gIGhhbmQuaGVybyA9IGhlcm9cbiAgcmV0dXJuIGhhbmRcbn1cblxuZnVuY3Rpb24gZGVkdWNlQW50ZShoYW5kKSB7XG4gIGlmICghaGFuZC5pbmZvKSByZXR1cm5cbiAgaWYgKGhhbmQuaW5mby5hbnRlICE9IG51bGwpIHJldHVyblxuICBpZiAoaGFuZC5wb3N0cyA9PSBudWxsIHx8IGhhbmQucG9zdHMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGhhbmQucG9zdHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwb3N0ID0gaGFuZC5wb3N0c1tpXVxuICAgIGlmIChwb3N0LnR5cGUgPT09ICdhbnRlJykge1xuICAgICAgaGFuZC5pbmZvLmFudGUgPSBwb3N0LmFtb3VudFxuICAgICAgcmV0dXJuXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGRlZHVjZUJsaW5kcyhoYW5kKSB7XG4gIC8vIENhc2ggKGF0IGxlYXN0IHpvbmUpIGdhbWVzIGRvbid0IGluY2x1ZGUgYmxpbmRzIGluIGhlYWRlclxuICBpZiAoIWhhbmQuaW5mbykgcmV0dXJuXG4gIGlmIChoYW5kLmluZm8uYmIgIT0gbnVsbCAmJiBoYW5kLmluZm8uc2IgIT0gbnVsbCkgcmV0dXJuXG4gIGlmIChoYW5kLnBvc3RzID09IG51bGwgfHwgaGFuZC5wb3N0cy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaGFuZC5wb3N0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBvc3QgPSBoYW5kLnBvc3RzW2ldXG4gICAgaWYgKHBvc3QudHlwZSA9PT0gJ2JiJyAmJiBoYW5kLmluZm8uYmIgPT0gbnVsbCkge1xuICAgICAgaGFuZC5pbmZvLmJiID0gcG9zdC5hbW91bnRcbiAgICAgIGlmIChoYW5kLmluZm8uc2IgIT0gbnVsbCkgcmV0dXJuXG4gICAgfSBlbHNlIGlmIChwb3N0LnR5cGUgPT09ICdzYicgJiYgaGFuZC5pbmZvLnNiID09IG51bGwpIHtcbiAgICAgIGhhbmQuaW5mby5zYiA9IHBvc3QuYW1vdW50XG4gICAgICBpZiAoaGFuZC5pbmZvLmJiICE9IG51bGwpIHJldHVyblxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkZWR1Y2VUYWJsZUluZm8oaGFuZCkge1xuICAvLyBqdXN0IGEgd2lsZCBndWVzcyAuLiBzb21ldGhpbmcgaXMgc2VyaW91c2x5IHdyb25nIGFueXdheXMgOylcbiAgaWYgKGhhbmQuc2VhdHMubGVuZ3RoID09PSAwKSB7XG4gICAgaGFuZC50YWJsZS5tYXhzZWF0cyA9IDJcbiAgICBoYW5kLnRhYmxlLmJ1dHRvbiA9IDFcbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciBidXR0b24gPSAxXG4gIGNvbnN0IGxlbiA9IGhhbmQuc2VhdHMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCBzZWF0ID0gaGFuZC5zZWF0c1tpXVxuICAgIGlmIChzZWF0LnBsYXllciA9PT0gJ0RlYWxlcicpIHtcbiAgICAgIHNlYXQuaXNidXR0b24gPSB0cnVlXG4gICAgICBidXR0b24gPSBzZWF0LnNlYXRub1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICAvLyBiZXN0IGd1ZXNzIHdlIGNhbiBkbywgd2lsbCBiZSBpbmFjY3VyYXRlIGluIGxvdHMgb2YgY2FzZXNcbiAgY29uc3QgbWF4c2VhdHMgPSAoXG4gICAgICBsZW4gPiA2ID8gOVxuICAgIDogbGVuID4gMiA/IDZcbiAgICA6IDJcbiAgKVxuICBoYW5kLnRhYmxlLm1heHNlYXRzID0gbWF4c2VhdHNcbiAgaGFuZC50YWJsZS5idXR0b24gPSBidXR0b25cbn1cblxuZnVuY3Rpb24gZmlsbFNob3dkb3duSGFuZHMoaGFuZCwgcmV2ZWFsZWQpIHtcbiAgaWYgKGhhbmQuc2hvd2Rvd24gPT0gbnVsbCB8fCBoYW5kLnNob3dkb3duLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gIGhhbmQuc2hvd2Rvd24uZm9yRWFjaChmaWxsKVxuICBmdW5jdGlvbiBmaWxsKHgpIHtcbiAgICBpZiAoeC50eXBlICE9PSAnc2hvdycgfHwgeC5jYXJkMSAhPSBudWxsKSByZXR1cm5cbiAgICBjb25zdCBjYXJkcyA9IHJldmVhbGVkW3gucGxheWVyXVxuICAgIGlmIChjYXJkcyA9PSBudWxsKSByZXR1cm5cbiAgICB4LmNhcmQxID0gY2FyZHMuY2FyZDFcbiAgICB4LmNhcmQyID0gY2FyZHMuY2FyZDJcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGp1c3RQbGF5ZXJBbmRTZWF0KHgpIHtcbiAgY29uc3QgbWFwID0gdGhpcy5tYXBcbiAgY29uc3QgZW50cnkgPSBtYXBbeC5wbGF5ZXJdXG4gIGlmIChlbnRyeSA9PSBudWxsKSByZXR1cm5cblxuICB4LnBsYXllciA9IGVudHJ5LnBsYXllclxuICB4LnNlYXRubyA9IGVudHJ5LnNlYXRub1xufVxuXG5mdW5jdGlvbiBpbXByb3ZlUGxheWVyTmFtZXNBbmRTZWF0TnVtYmVycyhoYW5kKSB7XG4gIC8vIHNlYXRub3MgYXJlIGFjdHVhbGx5IElEcyBhc3NpZ25lZCB0byBhIHBsYXllciB3aGljaCBoZSBrZWVwcyB0aHJ1IHRoZSBsaWZldGltZVxuICAvLyBvZiB0aGUgdG91cm5leSBldmVuIGlmIG1vdmVkIHRvIGFub3RoZXIgdGFibGUuIFNvIHdlJ2xsIHVzZSB0aGF0IGFzIHRoZSBuYW1lIChleGNlcHRcbiAgLy8gZm9yIHRoZSBoZXJvKS5cbiAgLy8gQWN0dWFsIHNlYXRub3MgYXJlIHRvdWdoZXIgdG8gZGVkdWNlLiBJbiBhIHNpbmdsZSB0YWJsZSBTTkcgdGhleSBjb3JyZXNwb25kIHRvIHRoZVxuICAvLyBwbGF5ZXIgbmFtZSwgYnV0IGluIE1UVHMgdGhleSBkb24ndC5cbiAgLy8gSGVyZSB3ZSBqdXN0IG5lZWQgdG8gbWFrZSBhIGRlY2lzaW9uIGFzIHRvIHdobyBpcyBzZWF0IDEgYW5kIGNhbGN1bGF0ZSB0aGUgb3RoZXJzXG4gIC8vIGZyb20gdGhlIG9yZGVyIGluIHdoaWNoIHRoZXkgYXJlIGxpc3RlZCAoaGFuZC5zZWF0cylcbiAgLy8gQmVzdCBpcyB0byBtYWtlIGhlcm8gc2VhdCAxIHNpbmNlIHdlIGtub3cgdGhhdCBoZSB3aWxsIGFsd2F5cyBiZSB0aGVyZSB0aHJvdWdob3V0XG4gIC8vIG11bHRpcGxlIGhhbmRzIGFuZCB0aGVyZWZvcmUgdGhlIHNlYXRzIHdpbGwgbm90IGNoYW5nZS5cblxuICAvLyBGaXJzdCB3ZSBidWlsZCB0aGUgbWFwIGJ5IGN1cnJlbnQgcGxheWVyIG5hbWVcbiAgY29uc3QgYmVmb3JlSGVybyA9IFtdXG4gIHZhciBpID0gMFxuICB2YXIgc2VhdG5vID0gMVxuICBjb25zdCBtYXAgPSB7fVxuICBmb3IgKDsgaSA8IGhhbmQuc2VhdHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzZWF0ID0gaGFuZC5zZWF0c1tpXVxuICAgIGlmIChzZWF0LnBsYXllciA9PT0gaGVybykge1xuICAgICAgbWFwW2hlcm9dID0geyBwbGF5ZXI6IGhlcm8sIHNlYXRubzogc2VhdG5vKysgfVxuICAgICAgYnJlYWtcbiAgICB9XG4gICAgYmVmb3JlSGVyby5wdXNoKHNlYXQpXG4gIH1cbiAgaWYgKGkgPT09IGhhbmQuc2VhdHMubGVuZ3RoKSByZXR1cm4gLy8gc29tZXRoaW5nIGlzIHNlcmlvdXNseSB3cm9uZyAoY291bGRuJ3QgZmluZCBoZXJvKVxuXG4gIC8vIHNlYXRzIG1lbnRpb25lZCBhZnRlciBoZXJvXG4gIGZvciAoaSA9IGkgKyAxOyBpIDwgaGFuZC5zZWF0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHNlYXQgPSBoYW5kLnNlYXRzW2ldXG4gICAgbWFwW3NlYXQucGxheWVyXSA9IHsgcGxheWVyOiBwcmVmaXggKyBzZWF0LnNlYXRubywgc2VhdG5vOiBzZWF0bm8rKyB9XG4gIH1cbiAgLy8gc2VhdHMgbWVudGlvbmVkIGJlZm9yZSBoZXJvXG4gIGZvciAodmFyIGogPSAwOyBqIDwgYmVmb3JlSGVyby5sZW5ndGg7IGorKykge1xuICAgIGNvbnN0IHNlYXQgPSBiZWZvcmVIZXJvW2pdXG4gICAgbWFwW3NlYXQucGxheWVyXSA9IHsgcGxheWVyOiBwcmVmaXggKyBzZWF0LnNlYXRubywgc2VhdG5vOiBzZWF0bm8rKyB9XG4gIH1cblxuICAvLyBOb3cgd2UgbmVlZCB0byBmaXggYWxsIHBsYXllciBuYW1lcyB0aHJvdWdob3V0IHRoZSBoYW5kXG4gIGNvbnN0IGN0eCA9IHsgbWFwIH1cbiAgaGFuZC5zZWF0cy5mb3JFYWNoKGFkanVzdFBsYXllckFuZFNlYXQsIGN0eClcbiAgaGFuZC5wb3N0cy5mb3JFYWNoKGFkanVzdFBsYXllckFuZFNlYXQsIGN0eClcbiAgaGFuZC5wcmVmbG9wLmZvckVhY2goYWRqdXN0UGxheWVyQW5kU2VhdCwgY3R4KVxuICBoYW5kLmZsb3AuZm9yRWFjaChhZGp1c3RQbGF5ZXJBbmRTZWF0LCBjdHgpXG4gIGhhbmQudHVybi5mb3JFYWNoKGFkanVzdFBsYXllckFuZFNlYXQsIGN0eClcbiAgaGFuZC5yaXZlci5mb3JFYWNoKGFkanVzdFBsYXllckFuZFNlYXQsIGN0eClcbiAgaGFuZC5zaG93ZG93bi5mb3JFYWNoKGFkanVzdFBsYXllckFuZFNlYXQsIGN0eClcbiAgaGFuZC5zdW1tYXJ5LmZvckVhY2goYWRqdXN0UGxheWVyQW5kU2VhdCwgY3R4KVxuXG4gIC8vIEZpbmFsbHkgZml4IHRoZSBidXR0b25cbiAgZm9yICh2YXIgayA9IDA7IGsgPCBoYW5kLnNlYXRzLmxlbmd0aDsgaysrKSB7XG4gICAgY29uc3Qgc2VhdCA9IGhhbmQuc2VhdHNba11cbiAgICBpZiAoc2VhdC5pc2J1dHRvbikgaGFuZC50YWJsZS5idXR0b24gPSBzZWF0LnNlYXRub1xuICB9XG59XG5cbmV4cG9ydHMuY2FuUGFyc2UgPSBmdW5jdGlvbiBjYW5QYXJzZShsaW5lcykge1xuICByZXR1cm4gbmV3IEhvbGRlbUlnbml0aW9uUGFyc2VyKGxpbmVzKS5jYW5QYXJzZSgpXG59XG5cbmZ1bmN0aW9uIGZpeE1lKHgpIHtcbiAgcmV0dXJuIHgucmVwbGFjZSgnICBbTUVdIDonLCAnIFtNRV0gOicpXG59XG5cbmZ1bmN0aW9uIGJ1eUluRnJvbUZpbGVOYW1lKGhhbmQsIGZpbGUpIHtcbiAgaWYgKGZpbGUgPT0gbnVsbCkgcmV0dXJuXG4gIGNvbnN0IHJ4ID0gL1skfOKCrF0oPzooW1xcZC4sXSspLVskfOKCrF0oW1xcZC4sXSspKS9cblxuICBjb25zdCBtYXRjaCA9IGZpbGUubWF0Y2gocngpXG4gIGlmICghbWF0Y2ggfHwgbWF0Y2hbMV0gPT0gbnVsbCB8fCBtYXRjaFsyXSA9PSBudWxsKSByZXR1cm5cblxuICBjb25zdCBkb25hdGlvbiA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzFdKVxuICBjb25zdCByYWtlID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbMl0pXG5cbiAgaGFuZC5pbmZvLmRvbmF0aW9uID0gZG9uYXRpb25cbiAgaGFuZC5pbmZvLnJha2UgPSByYWtlXG4gIGhhbmQuaW5mby5idXlpbiA9IGRvbmF0aW9uICsgcmFrZVxufVxuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gcGFyc2UobGluZXMsIG9wdHMpIHtcbiAgLy8gRml4IHRoZSBpbmNvbnNpc3RlbmN5IGluIGhlcm8gaW5kaWNhdGlvbiBpbiBwbGF5ZXIgbmFtZXMgYmV0d2VlbiBjYXNoIGNhbWVzIGFuZCB0b3VybmV5c1xuICBsaW5lcyA9IGxpbmVzLm1hcChmaXhNZSlcblxuICBjb25zdCBwYXJzZXIgPSBuZXcgSG9sZGVtSWduaXRpb25QYXJzZXIobGluZXMsIG9wdHMpXG4gIGNvbnN0IGhhbmQgPSBwYXJzZXIucGFyc2UoKVxuICBkZWR1Y2VBbnRlKGhhbmQpXG4gIGRlZHVjZUJsaW5kcyhoYW5kKVxuICBkZWR1Y2VUYWJsZUluZm8oaGFuZClcbiAgZmlsbFNob3dkb3duSGFuZHMoaGFuZCwgcGFyc2VyLl9yZXZlYWxlZENhcmRzKVxuICBjb3JyZWN0SGVyb05hbWUoaGFuZClcbiAgaW1wcm92ZVBsYXllck5hbWVzQW5kU2VhdE51bWJlcnMoaGFuZClcbiAgYnV5SW5Gcm9tRmlsZU5hbWUoaGFuZCwgb3B0cyAmJiBvcHRzLmJ1eWluRmlsZSlcbiAgcmV0dXJuIGhhbmRcbn1cblxuZXhwb3J0cy5jcmVhdGUgPSBmdW5jdGlvbiBjcmVhdGUobGluZXMsIGluZm9Pbmx5KSB7XG4gIHJldHVybiBuZXcgSG9sZGVtSWduaXRpb25QYXJzZXIobGluZXMsIGluZm9Pbmx5KVxufVxuXG4iLCIndXNlIHN0cmljdCdcblxuY29uc3QgcHJpY2VGcmVlcm9sbCAgPSByZXF1aXJlKCcuLi91dGlsL3R3ZWFrcycpLnByaWNlRnJlZXJvbGxcblxuY29uc3Qgcm9vbUdhbWVJRCA9XG4gIC8vIFBva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTkyNTQ4OlxuICAvLyBQb2tlclN0YXJzIFpvb20gSGFuZCAjMTY0MTgxNzY5MDMzOlxuICAnXihQb2tlclN0YXJzKSAoPzpab29tICk/KD86SGFuZHxHYW1lKSAjKFxcXFxkKyk6ICsnXG5cbmNvbnN0IHRvdXJuYW1lbnRJRCA9XG4gIC8vIFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsXG4gICdUb3VybmFtZW50ICMoXFxcXGQrKSwgJ1xuXG5jb25zdCB0b3VybmFtZW50QnV5SW4gPVxuICAvLyAkMC45MSskMC4wOVxuICAnKFskfOKCrF0pKCg/OltcXFxcZF0rXFxcXC5cXFxcZCspfCg/OltcXFxcZF0rKSlcXFxcKyhbJHzigqxdKSgoPzpbXFxcXGRdK1xcXFwuXFxcXGQrKXwoPzpbXFxcXGRdKykpLisnXG5cbmNvbnN0IGNhc2hHYW1lQmxpbmRzID1cbiAgLy8gKCQwLjAyLyQwLjA1KVxuICAnXFxcXCgoWyR84oKsXSkoW14vXSspXFxcXC9bJHzigqxdKFteKV0rKVxcXFwpJ1xuXG5jb25zdCBwb2tlclR5cGUgPVxuICAvLyBVU0QgSG9sZCdlbSBObyBMaW1pdCAtXG4gICcoSG9sZFxcJ2VtKSArKE5vIExpbWl0KSAtPyAqJ1xuXG5jb25zdCB0b3VybmFtZW50TGV2ZWwgPVxuICAvLyBMZXZlbCBYSSAoNDAwLzgwMClcbiAgJ0xldmVsIChbXihdKylcXFxcKChbXi9dKykvKFteKV0rKVxcXFwpKD86IC0gKXswLDF9J1xuXG5jb25zdCBkYXRlID1cbiAgLy8gMjAxNi8wMy8wMVxuICAnW15cXFxcZF0qKFxcXFxkezR9KS4oXFxcXGR7Mn0pLihcXFxcZHsyfSknXG5cbmNvbnN0IHRpbWUgPVxuICAvLyAxOjI5OjQxIEVUXG4gIC8vIDIzOjM3OjQzIENFVCBbMjAxOC8wMy8wOSAxNzozNzo0MyBFVF1cbiAgJ1teXFxcXGRdKihbXjpdKyk6KFteOl0rKTooW15cXFxcc10rKSAoW15cXFxcc10qKS4qJ1xuXG5jb25zdCB0b3VybmFtZW50SW5mbyA9IG5ldyBSZWdFeHAoXG4gICAgcm9vbUdhbWVJRFxuICArIHRvdXJuYW1lbnRJRFxuICArIHRvdXJuYW1lbnRCdXlJblxuICArIHBva2VyVHlwZVxuICArIHRvdXJuYW1lbnRMZXZlbFxuICArIGRhdGVcbiAgKyB0aW1lXG4gICsgJyQnXG4pXG5jb25zdCB0b3VybmFtZW50SW5mb0lkeHMgPSB7XG4gICAgcm9vbSAgICAgIDogMVxuICAsIGhhbmRpZCAgICA6IDJcbiAgLCBnYW1lbm8gICAgOiAzXG4gICwgY3VycmVuY3kgIDogNFxuICAsIGRvbmF0aW9uICA6IDVcbiAgLCByYWtlICAgICAgOiA3XG4gICwgcG9rZXJ0eXBlIDogOFxuICAsIGxpbWl0ICAgICA6IDlcbiAgLCBsZXZlbCAgICAgOiAxMFxuICAsIHNiICAgICAgICA6IDExXG4gICwgYmIgICAgICAgIDogMTJcbiAgLCB5ZWFyICAgICAgOiAxM1xuICAsIG1vbnRoICAgICA6IDE0XG4gICwgZGF5ICAgICAgIDogMTVcbiAgLCBob3VyICAgICAgOiAxNlxuICAsIG1pbiAgICAgICA6IDE3XG4gICwgc2VjICAgICAgIDogMThcbiAgLCB0aW1lem9uZSAgOiAxOVxufVxuXG5jb25zdCBjYXNoR2FtZUluZm8gPSBuZXcgUmVnRXhwKFxuICAgIHJvb21HYW1lSURcbiAgKyBwb2tlclR5cGVcbiAgKyBjYXNoR2FtZUJsaW5kc1xuICArICdbIC1dKidcbiAgKyBkYXRlXG4gICsgdGltZVxuICArICckJ1xuKVxuXG5jb25zdCBjYXNoR2FtZUluZm9JZHhzID0ge1xuICAgIHJvb20gICAgICA6IDFcbiAgLCBoYW5kaWQgICAgOiAyXG4gICwgcG9rZXJ0eXBlIDogM1xuICAsIGxpbWl0ICAgICA6IDRcbiAgLCBjdXJyZW5jeSAgOiA1XG4gICwgc2IgICAgICAgIDogNlxuICAsIGJiICAgICAgICA6IDdcbiAgLCB5ZWFyICAgICAgOiA4XG4gICwgbW9udGggICAgIDogOVxuICAsIGRheSAgICAgICA6IDEwXG4gICwgaG91ciAgICAgIDogMTFcbiAgLCBtaW4gICAgICAgOiAxMlxuICAsIHNlYyAgICAgICA6IDEzXG4gICwgdGltZXpvbmUgIDogMTRcbn1cblxuY29uc3QgdG91cm5hbWVudFRhYmxlID1cbiAgL15UYWJsZSAnXFxkKyAoXFxkKyknIChcXGQrKS1tYXggU2VhdCAjKFxcZCspIGlzLitidXR0b24kL2lcblxuY29uc3QgdG91cm5hbWVudFRhYmxlSWR4cyA9IHtcbiAgICB0YWJsZW5vICA6IDFcbiAgLCBtYXhzZWF0cyA6IDJcbiAgLCBidXR0b24gICA6IDNcbn1cblxuY29uc3QgY2FzaEdhbWVUYWJsZSA9XG4gIC9eVGFibGUgJyhbXiddKyknIChcXGQrKS1tYXggU2VhdCAjKFxcZCspIGlzLitidXR0b24kL2lcblxuY29uc3QgY2FzaEdhbWVUYWJsZUlkeHMgPSB7XG4gICAgdGFibGVubyAgOiAxXG4gICwgbWF4c2VhdHMgOiAyXG4gICwgYnV0dG9uICAgOiAzXG59XG5cbmNvbnN0IEhhbmRIaXN0b3J5UGFyc2VyID0gcmVxdWlyZSgnLi9iYXNlJylcblxuZnVuY3Rpb24gSG9sZGVtUG9rZXJTdGFyc1BhcnNlcihsaW5lcywgb3B0cykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSG9sZGVtUG9rZXJTdGFyc1BhcnNlcikpIHJldHVybiBuZXcgSG9sZGVtUG9rZXJTdGFyc1BhcnNlcihsaW5lcywgb3B0cylcbiAgSGFuZEhpc3RvcnlQYXJzZXIuY2FsbCh0aGlzLCBsaW5lcywgb3B0cylcbn1cblxuSG9sZGVtUG9rZXJTdGFyc1BhcnNlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEhhbmRIaXN0b3J5UGFyc2VyLnByb3RvdHlwZSlcbkhvbGRlbVBva2VyU3RhcnNQYXJzZXIucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gSG9sZGVtUG9rZXJTdGFyc1BhcnNlclxuY29uc3QgcHJvdG8gPSBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyLnByb3RvdHlwZVxuXG5wcm90by5faGFuZEluZm9SeCA9IGZ1bmN0aW9uIF9oYW5kSW5mb1J4KGdhbWVUeXBlKSB7XG4gIHN3aXRjaCAoZ2FtZVR5cGUudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ3RvdXJuYW1lbnQnOiByZXR1cm4geyByeDogdG91cm5hbWVudEluZm8sIGlkeHM6IHRvdXJuYW1lbnRJbmZvSWR4cyB9XG4gICAgY2FzZSAnY2FzaGdhbWUnOiByZXR1cm4geyByeDogY2FzaEdhbWVJbmZvLCBpZHhzOiBjYXNoR2FtZUluZm9JZHhzIH1cbiAgICBkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZ2FtZSB0eXBlICcgKyBnYW1lVHlwZSlcbiAgfVxufVxuXG5wcm90by5fdGFibGVSeCA9IGZ1bmN0aW9uIF90YWJsZVJ4KGdhbWVUeXBlKSB7XG4gIHN3aXRjaCAoZ2FtZVR5cGUudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ3RvdXJuYW1lbnQnOiByZXR1cm4geyByeDogdG91cm5hbWVudFRhYmxlLCBpZHhzOiB0b3VybmFtZW50VGFibGVJZHhzIH1cbiAgICBjYXNlICdjYXNoZ2FtZSc6IHJldHVybiB7IHJ4OiBjYXNoR2FtZVRhYmxlLCBpZHhzOiBjYXNoR2FtZVRhYmxlSWR4cyB9XG4gICAgZGVmYXVsdDogdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGdhbWUgdHlwZSAnICsgZ2FtZVR5cGUpXG4gIH1cbn1cblxuLy8gSGFuZCBTZXR1cFxucHJvdG8uX3NlYXRJbmZvUnggICAgICAgICAgPSAvXlNlYXQgKFxcZCspOiAoLispXFwoWyR84oKsXT8oW14gXSspIGluIGNoaXBzKD86LCAuKz8gYm91bnR5KT9cXCkoIC4rc2l0dGluZyBvdXQpPyQvaVxucHJvdG8uX3Bvc3RSeCAgICAgICAgICAgICAgPSAvXihbXjpdKyk6IHBvc3RzICg/OnRoZSApPyhhbnRlfHNtYWxsIGJsaW5kfGJpZyBibGluZCkgWyR84oKsXT8oW14gXSspJC9pXG5cbi8vIFN0cmVldCBJbmRpY2F0b3JzXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IC9eXFwqXFwqXFwqIEhPTEUgQ0FSRFMgXFwqXFwqXFwqJC9pXG5wcm90by5fc3RyZWV0SW5kaWNhdG9yUnggICA9IC9eXFwqXFwqXFwqIChGTE9QfFRVUk58UklWRVIpIFxcKlxcKlxcKlteW10rXFxbKC4uKSAoLi4pICguLikoPzogKC4uKSk/XSg/OiBcXFsoLi4pXSk/JC9pXG5wcm90by5fc2hvd2Rvd25JbmRpY2F0b3JSeCA9IC9eXFwqXFwqXFwqIFNIT1cgRE9XTiBcXCpcXCpcXCokL2lcbnByb3RvLl9zdW1tYXJ5SW5kaWNhdG9yUnggID0gL15cXCpcXCpcXCogU1VNTUFSWSBcXCpcXCpcXCokL2lcblxuLy8gU3RyZWV0IGFjdGlvbnNcbnByb3RvLl9ob2xlY2FyZHNSeCAgICAgICAgID0gL15EZWFsdCB0byAoW15bXSspIFxcWyguLikgKC4uKV0kL2lcbnByb3RvLl9hY3Rpb25SeCAgICAgICAgICAgID0gL14oW146XSspOiAocmFpc2VzfGJldHN8Y2FsbHN8Y2hlY2tzfGZvbGRzKSA/WyR84oKsXT8oW14gXSspPyg/OiB0byBbJHzigqxdPyhbXiBdKykpPyguK2FsbC1pbik/JC9pXG5wcm90by5fY29sbGVjdFJ4ICAgICAgICAgICA9IC9eKC4rKSBjb2xsZWN0ZWQgWyR84oKsXT8oW14gXSspIGZyb20gKD86KG1haW58c2lkZSkgKT9wb3QkL2lcbnByb3RvLl9iZXRSZXR1cm5lZFJ4ICAgICAgID0gL151bmNhbGxlZCBiZXQgWyhdP1skfOKCrF0/KFteICldKylbKV0/IHJldHVybmVkIHRvICguKykkL2lcblxuLy8gU2hvd2Rvd24gKGFsc28gdXNlcyBfY29sbGVjdFJ4IGFuZCBfYmV0UmV0dXJuZWRSeClcbnByb3RvLl9zaG93UnggICAgICAgICAgICAgID0gL14oW146XSspOiBzaG93cyBcXFsoLi4pICguLildIFxcKChbXildKylcXCkkL2lcbnByb3RvLl9tdWNrUnggICAgICAgICAgICAgID0gL14oW146XSspOiBtdWNrcyBoYW5kJC9pXG5wcm90by5fZmluaXNoUnggICAgICAgICAgICA9IC9eKC4rPykgZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQoPzogaW4gKFxcZCspLisgcGxhY2UpPyg/OiBhbmQgcmVjZWl2ZWQgWyR84oKsXShbXiBdKylcXC4pPyQvaVxuXG4vLyBTdW1tYXJ5XG5wcm90by5fc3VtbWFyeVNpbmdsZVBvdFJ4ICA9IC9eVG90YWwgcG90IFskfOKCrF0/KFteIF0rKSBcXHwgUmFrZSBbJHzigqxdPyhbXiBdKykkL2lcbnByb3RvLl9zdW1tYXJ5U3BsaXRQb3RSeCAgID0gL15Ub3RhbCBwb3QgWyR84oKsXT8oW14gXSspIE1haW4gcG90IFskfOKCrF0/KFteIF0rKVxcLiBTaWRlIHBvdCBbJHzigqxdPyhbXiBdKylcXC4gXFx8IFJha2UgWyR84oKsXT8oW14gXSspJC9pXG5wcm90by5fc3VtbWFyeUJvYXJkUnggICAgICA9IC9eQm9hcmQgXFxbKC4uKT8oIC4uKT8oIC4uKT8oIC4uKT8oIC4uKT9dJC9pXG5wcm90by5fc3VtbWFyeU11Y2tlZFJ4ICAgICA9IC9eU2VhdCAoXFxkKyk6ICguKz8pICg/OlxcKChidXR0b258c21hbGwgYmxpbmR8YmlnIGJsaW5kKVxcKSApP211Y2tlZCBcXFsoLi4pICguLildJC9pXG5wcm90by5fc3VtbWFyeUNvbGxlY3RlZFJ4ICA9IC9eU2VhdCAoXFxkKyk6ICguKz8pICg/OlxcKChidXR0b258c21hbGwgYmxpbmR8YmlnIGJsaW5kKVxcKSApP2NvbGxlY3RlZCBcXChbJHzigqxdPyhbXildKylcXCkkL2lcbnByb3RvLl9zdW1tYXJ5U2hvd2VkV29uUnggID0gL15TZWF0IChcXGQrKTogKC4rPykgKD86XFwoKGJ1dHRvbnxzbWFsbCBibGluZHxiaWcgYmxpbmQpXFwpICk/c2hvd2VkIFxcWyguLikgKC4uKV0gYW5kIHdvbiBcXChbJHzigqxdPyhbXildKylcXCkgd2l0aCAoLispJC9pXG5wcm90by5fc3VtbWFyeVNob3dlZExvc3RSeCA9IC9eU2VhdCAoXFxkKyk6ICguKz8pICg/OlxcKChidXR0b258c21hbGwgYmxpbmR8YmlnIGJsaW5kKVxcKSApP3Nob3dlZCBcXFsoLi4pICguLildIGFuZCBsb3N0IHdpdGggKC4rKSQvaVxucHJvdG8uX3N1bW1hcnlGb2xkZWRSeCAgICAgPSAvXlNlYXQgKFxcZCspOiAoLis/KSAoPzpcXCgoYnV0dG9ufHNtYWxsIGJsaW5kfGJpZyBibGluZClcXCkgKT9mb2xkZWQgKGJlZm9yZSBGbG9wfG9uIHRoZSBGbG9wfG9uIHRoZSBUdXJufG9uIHRoZSBSaXZlcikoIFxcKGRpZG4ndCBiZXRcXCkpPyQvaVxucHJvdG8uX3N1bW1hcnlJbmNsdWRlc1Bvc2l0aW9uID0gdHJ1ZVxuXG5wcm90by5fcmV2ZWFsUnggICAgICAgICAgICA9IG51bGxcblxucHJvdG8uX2dhbWVUeXBlID0gZnVuY3Rpb24gX2dhbWVUeXBlKCkge1xuICBpZiAodGhpcy5fY2FjaGVkR2FtZVR5cGUpIHJldHVybiB0aGlzLl9jYWNoZWRHYW1lVHlwZVxuICBjb25zdCBsaW5lcyA9IHRoaXMuX2xpbmVzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGxpbmUgPSBwcmljZUZyZWVyb2xsKGxpbmVzW2ldKVxuICAgIGlmICh0b3VybmFtZW50SW5mby50ZXN0KGxpbmUpKSB7XG4gICAgICB0aGlzLl9jYWNoZWRHYW1lVHlwZSA9ICd0b3VybmFtZW50J1xuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZEdhbWVUeXBlXG4gICAgfVxuICAgIGlmIChjYXNoR2FtZUluZm8udGVzdChsaW5lKSkge1xuICAgICAgdGhpcy5fY2FjaGVkR2FtZVR5cGUgPSAnY2FzaGdhbWUnXG4gICAgICByZXR1cm4gdGhpcy5fY2FjaGVkR2FtZVR5cGVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuZXhwb3J0cy5jYW5QYXJzZSA9IGZ1bmN0aW9uIGNhblBhcnNlKGxpbmVzKSB7XG4gIHJldHVybiBuZXcgSG9sZGVtUG9rZXJTdGFyc1BhcnNlcihsaW5lcykuY2FuUGFyc2UoKVxufVxuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gcGFyc2UobGluZXMsIGluZm9Pbmx5KSB7XG4gIHJldHVybiBuZXcgSG9sZGVtUG9rZXJTdGFyc1BhcnNlcihsaW5lcywgaW5mb09ubHkpLnBhcnNlKClcbn1cblxuZXhwb3J0cy5jcmVhdGUgPSBmdW5jdGlvbiBjcmVhdGUobGluZXMsIGluZm9Pbmx5KSB7XG4gIHJldHVybiBuZXcgSG9sZGVtUG9rZXJTdGFyc1BhcnNlcihsaW5lcywgaW5mb09ubHkpXG59XG4iLCIndXNlIHN0cmljdCdcblxuZXhwb3J0cy50cmltTGluZSA9IGZ1bmN0aW9uIHRyaW1MaW5lKGxpbmUpIHsgcmV0dXJuIGxpbmUudHJpbSgpIH1cbmV4cG9ydHMuZW1wdHlMaW5lID0gZnVuY3Rpb24gZW1wdHlMaW5lKGxpbmUpIHsgcmV0dXJuIGxpbmUubGVuZ3RoIH1cbmV4cG9ydHMuc2FmZUxvd2VyID0gZnVuY3Rpb24gc2FmZUxvd2VyKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBzLnRvTG93ZXJDYXNlKClcbn1cbmV4cG9ydHMuc2FmZVVwcGVyID0gZnVuY3Rpb24gc2FmZVVwcGVyKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBzLnRvVXBwZXJDYXNlKClcbn1cbmV4cG9ydHMuc2FmZUZpcnN0VXBwZXIgPSBmdW5jdGlvbiBzYWZlRmlyc3RVcHBlcihzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcgfHwgcy5sZW5ndGggPCAxXG4gICAgPyBzXG4gICAgOiBzWzBdLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpXG59XG5leHBvcnRzLnNhZmVUcmltID0gZnVuY3Rpb24gc2FmZVRyaW0ocykge1xuICByZXR1cm4gdHlwZW9mIHMgPT09ICd1bmRlZmluZWQnXG4gICAgPyB1bmRlZmluZWRcbiAgICA6IHMudHJpbSgpXG59XG5leHBvcnRzLnNhZmVQYXJzZUludCA9IGZ1bmN0aW9uIHNhZmVQYXJzZUludChzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCdcbiAgICA/IHVuZGVmaW5lZFxuICAgIDogcGFyc2VJbnQocylcbn1cbmV4cG9ydHMuc2FmZVBhcnNlRmxvYXQgPSBmdW5jdGlvbiBzYWZlUGFyc2VGbG9hdChzKSB7XG4gIHJldHVybiAoXG4gICAgICB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcgPyAgdW5kZWZpbmVkXG4gICAgOiB0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBwYXJzZUZsb2F0KHMucmVwbGFjZSgvLC9nLCAnJykpXG4gICAgOiBzXG4gIClcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBwcmljZUZyZWVyb2xsKGxpbmUpIHtcbiAgLy8gQ29udmVydGluZyB0aGUgd29yZCAnRnJlZXJvbGwnIGludG8gYSByZWZsZWN0aXZlIHRvdXJuYW1lbnQgYnV5aW5cbiAgLy8gb2YgIzBcbiAgLy8gWHhYOiBzb21ld2hhdCBoYWNreSBidXQgYSBxdWljayBmaXggZm9yIGZyZWVyb2xsIGVkZ2UgY2FzZVxuICAvLyBQcm9wZXIgc29sdXRpb24gaXMgbXVjaCBtb3JlIGludm9sdmVkIHNpbmNlIG5vdCBvbmx5IGlzIHRoZSByZWdleFxuICAvLyBkaWZmZXJlbnQsIGJ1dCBhbHNvIGFsbCBpbmRleGVzIGNoYW5nZSBhcyB0aGVyZSBpcyBubyBjdXJyZW5jeVxuICAvLyBvciBkb25hdGlvbiBpbiBhIGZyZWVlcm9sbFxuICByZXR1cm4gbGluZS5yZXBsYWNlKC9GcmVlcm9sbC9pLCAnJDAuMDArJDAuMDAgVVNEJylcbn1cblxuZXhwb3J0cy5wcmljZUZyZWVyb2xsID0gcHJpY2VGcmVlcm9sbFxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBoaHYgPSByZXF1aXJlKCcuLi9oaHYnKVxuY29uc3QgaGhwID0gcmVxdWlyZSgnaGhwJylcbmNvbnN0IGhoYSA9IHJlcXVpcmUoJ2hoYScpXG5cbmNvbnN0IHZpc3VhbGl6ZWRIYW5kc0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Zpc3VhbGl6ZWQtaGFuZHMnKVxuY29uc3QgaGFuZGhpc3RvcnlFbCAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGFuZGhpc3RvcnktZW50cnknKVxuY29uc3QgZmlsdGVyRWwgICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyJylcbmNvbnN0IGxvYWRTYW1wbGVFbCAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYWQtc2FtcGxlJylcbmNvbnN0IGxvYWRGaWxlRWwgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYWQtZmlsZScpXG5cbmhodi5pbmplY3RTdHlsZShoaHYuY3NzLCBkb2N1bWVudCwgJ2hodi1oYW5kLWNzcycpXG5cbmZ1bmN0aW9uIGFuYWx5emVIaXN0b3J5IChoKSB7XG4gIGNvbnN0IHBhcnNlZCA9IGhocChoKVxuICB0cnkge1xuICAgIHJldHVybiBoaGEocGFyc2VkKVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICAgIGNvbnNvbGUuZXJyb3IoaClcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmNvbnN0IHBsYXllcnMgPSB7fVxuY29uc3Qgc2hvd0NoaXBzID0gdHJ1ZVxuZnVuY3Rpb24gYWRkUGxheWVyIChrKSB7IHBsYXllcnNba10gPSB0cnVlIH1cbmZ1bmN0aW9uIHJlbmRlciAoaCkge1xuICBjb25zdCBpbmZvID0gaGh2LnJlbmRlcihoLCBzaG93Q2hpcHMpXG4gIGluZm8ucGxheWVycy5mb3JFYWNoKGFkZFBsYXllcilcbiAgcmV0dXJuIGluZm8uaHRtbFxufVxuXG5mdW5jdGlvbiBpc251bGwgKHgpIHsgcmV0dXJuICEheCB9XG5cbmZ1bmN0aW9uIGluaXRpYWxpemVGaWx0ZXIgKGZpbHRlckh0bWwsIGhlcm8pIHtcbiAgZmlsdGVyRWwuaW5uZXJIVE1MID0gZmlsdGVySHRtbFxuXG4gIGNvbnN0IHBsYXllcnNGaWx0ZXJFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2hodi1maWx0ZXItcGxheWVycycpWzBdXG4gIGNvbnN0IHNob3dGaWx0ZXJFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2hodi1maWx0ZXItc2hvdycpWzBdXG4gIGNvbnN0IGRpc3BsYXlGaWx0ZXJFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2hodi1maWx0ZXItZGlzcGxheScpWzBdXG5cbiAgcGxheWVyc0ZpbHRlckVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9ucGxheWVyc0NoYW5nZSlcbiAgc2hvd0ZpbHRlckVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uc2hvd0NoYW5nZSlcbiAgZGlzcGxheUZpbHRlckVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9uZGlzcGxheUNoYW5nZSlcblxuICBjb25zdCBvcHRzID0ge1xuICAgICAgaGFuZDogbnVsbFxuICAgICwgcGxheWVyczogeyBmaWx0ZXI6ICdpbnZlc3RlZCcgfVxuICB9XG4gIGxldCBzZWxlY3RlZFBsYXllciA9IGhlcm9cbiAgbGV0IHBsYXllclNlbGVjdGVkID0gZmFsc2VcblxuICBmdW5jdGlvbiBvbnBsYXllcnNDaGFuZ2UgKGUpIHtcbiAgICBzZWxlY3RlZFBsYXllciA9IGUudGFyZ2V0LnZhbHVlXG4gICAgdXBkYXRlU2VsZWN0UGxheWVyKClcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uc2hvd0NoYW5nZSAoZSkge1xuICAgIGNvbnN0IGZpbHRlciA9IGUudGFyZ2V0LnZhbHVlXG4gICAgaWYgKGZpbHRlciA9PT0gJ2FsbCcpIHtcbiAgICAgIG9wdHMuaGFuZCA9IG51bGxcbiAgICB9IGVsc2Uge1xuICAgICAgb3B0cy5oYW5kID0geyBmaWx0ZXI6IGZpbHRlciwgd2hvOiBzZWxlY3RlZFBsYXllciB9XG4gICAgfVxuICAgIHVwZGF0ZUZpbHRlcihvcHRzKVxuICB9XG5cbiAgZnVuY3Rpb24gb25kaXNwbGF5Q2hhbmdlIChlKSB7XG4gICAgY29uc3QgdGd0ID0gZS50YXJnZXRcbiAgICBpZiAodGd0LnZhbHVlID09PSAnc2VsZWN0UGxheWVyJykge1xuICAgICAgcGxheWVyU2VsZWN0ZWQgPSB0Z3QuY2hlY2tlZFxuICAgICAgcmV0dXJuIHVwZGF0ZVNlbGVjdFBsYXllcih0Z3QuY2hlY2tlZClcbiAgICB9XG4gICAgY29uc3Qgc2hvd0luYWN0aXZlID0gdGd0LmNoZWNrZWRcbiAgICBvcHRzLnBsYXllcnMgPSBzaG93SW5hY3RpdmUgPyBudWxsIDogeyBmaWx0ZXI6ICdpbnZlc3RlZCcgfVxuICAgIHVwZGF0ZUZpbHRlcihvcHRzKVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU2VsZWN0UGxheWVyICgpIHtcbiAgICBpZiAob3B0cy5oYW5kKSBvcHRzLmhhbmQud2hvID0gc2VsZWN0ZWRQbGF5ZXJcbiAgICB1cGRhdGVGaWx0ZXIoKVxuICAgIGhodi5zZWxlY3RQbGF5ZXIocGxheWVyU2VsZWN0ZWQsIHNlbGVjdGVkUGxheWVyKVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRmlsdGVyICgpIHtcbiAgICBoaHYuZmlsdGVySGFuZHMob3B0cylcbiAgfVxuXG4gIHVwZGF0ZUZpbHRlcigpXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZSAoKSB7XG4gIGNvbnN0IGhpc3RvcnlUeHQgPSBoYW5kaGlzdG9yeUVsLnZhbHVlLnRyaW0oKVxuICBjb25zdCBoaXN0b3JpZXMgPSBoaHAuZXh0cmFjdEhhbmRzKGhpc3RvcnlUeHQpXG4gIGNvbnN0IGFuYWx5emVkID0gaGlzdG9yaWVzLm1hcChhbmFseXplSGlzdG9yeSkuZmlsdGVyKGlzbnVsbClcbiAgY29uc3Qgc29ydGVkID0gaGh2LnNvcnRCeURhdGVUaW1lRGVzY2VuZGluZyhhbmFseXplZClcbiAgY29uc3QgcmVuZGVyZWQgPSBzb3J0ZWQubWFwKHJlbmRlcikuam9pbignJylcbiAgY29uc3QgYWxsTmFtZXMgPSBPYmplY3Qua2V5cyhwbGF5ZXJzKVxuICBjb25zdCBoZXJvID0gYW5hbHl6ZWRbMF0uaGVyb1xuICBjb25zdCBmaWx0ZXJIdG1sID0gaGh2LnJlbmRlckZpbHRlcihhbGxOYW1lcywgaGVybylcblxuICB2aXN1YWxpemVkSGFuZHNFbC5pbm5lckhUTUwgPSByZW5kZXJlZCArICc8ZGl2PlRvdGFsIG9mICcgKyBzb3J0ZWQubGVuZ3RoICsgJyBoYW5kcy48L2Rpdj4nXG5cbiAgaW5pdGlhbGl6ZUZpbHRlcihmaWx0ZXJIdG1sLCBoZXJvKVxufVxuZnVuY3Rpb24gb25pbnB1dCAoKSB7XG4gIGxvYWRGaWxlRWwudmFsdWUgPSAnJ1xuICB1cGRhdGUoKVxufVxuaGFuZGhpc3RvcnlFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIG9uaW5wdXQpXG5cbmZ1bmN0aW9uIG9ubG9hZFNhbXBsZSAoKSB7XG4gIGhhbmRoaXN0b3J5RWwudmFsdWUgPSByZXF1aXJlKCcuL3NhbXBsZScpXG4gIG9uaW5wdXQoKVxufVxubG9hZFNhbXBsZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25sb2FkU2FtcGxlKVxuXG5mdW5jdGlvbiBvbmxvYWRlZEZpbGUgKGUpIHtcbiAgaWYgKGhhbmRoaXN0b3J5RWwudmFsdWUgPT09IGUudGFyZ2V0LnJlc3VsdCkgcmV0dXJuXG4gIGhhbmRoaXN0b3J5RWwudmFsdWUgPSBlLnRhcmdldC5yZXN1bHRcbiAgdXBkYXRlKClcbn1cblxuZnVuY3Rpb24gb25sb2FkRmlsZSAoZSkge1xuICBjb25zdCBmaWxlID0gdGhpcy5maWxlcy5pdGVtKDApXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xuICAgIGNvbnN0IGZpbGVSZWFkZXIgPSBuZXcgd2luZG93LkZpbGVSZWFkZXIoKVxuICAgIGZpbGVSZWFkZXIucmVhZEFzVGV4dChmaWxlKVxuICAgIGZpbGVSZWFkZXIub25sb2FkID0gb25sb2FkZWRGaWxlXG4gICAgc2V0VGltZW91dChyZWZyZXNoLCAyMDAwKVxuICB9XG4gIHJlZnJlc2goKVxufVxuXG5sb2FkRmlsZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9ubG9hZEZpbGUpXG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gW1xuICAgICcqKioqKioqKioqKiAjIDEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDY3MTczOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjM0OjI0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MjY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgyNjg5MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTYzNDMgaW4gY2hpcHMpJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA4MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbS2QgSmhdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk3NyB0byAxNzc3J1xuICAsICdJcmlzaGEyOiBjYWxscyA5NzcnXG4gICwgJyoqKiBGTE9QICoqKiBbN2ggVGggSnNdJ1xuICAsICdoZWxkOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMzIwMCdcbiAgLCAnaGVsZDogcmFpc2VzIDM0NjYgdG8gNjY2NidcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDE1NzcxIHRvIDIyNDM3IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGNhbGxzIDc4NTAgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICg3OTIxKSByZXR1cm5lZCB0byBJcmlzaGEyJ1xuICAsICcqKiogVFVSTiAqKiogWzdoIFRoIEpzXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFs3aCBUaCBKcyA2ZF0gWzljXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ2hlbGQ6IHNob3dzIFtLZCBKaF0gKGEgcGFpciBvZiBKYWNrcyknXG4gICwgJ0lyaXNoYTI6IHNob3dzIFs4cyA5c10gKGEgc3RyYWlnaHQsIFNldmVuIHRvIEphY2spJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAzMjczNiBmcm9tIHBvdCdcbiAgLCAnaGVsZCBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiAzcmQgcGxhY2UgYW5kIHJlY2VpdmVkICQ2Ljc1LidcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzI3MzYgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs3aCBUaCBKcyA2ZCA5Y10nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBzaG93ZWQgWzhzIDlzXSBhbmQgd29uICgzMjczNikgd2l0aCBhIHN0cmFpZ2h0LCBTZXZlbiB0byBKYWNrJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKHNtYWxsIGJsaW5kKSBzaG93ZWQgW0tkIEpoXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBKYWNrcydcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTIwNTk0MjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6MzM6NTQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDM0NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MzE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzMzMwMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoNjQwOSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1FkIFFzXSdcbiAgLCAnRmlzY2hlcnNpdG86IHJhaXNlcyAyNjI1IHRvIDM0MjUgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDMwMjUnXG4gICwgJ2hlbGQ6IHJhaXNlcyAyOTM0IHRvIDYzNTkgYW5kIGlzIGFsbC1pbidcbiAgLCAnRG1lbGxvSDogY2FsbHMgMjkzNCdcbiAgLCAnKioqIEZMT1AgKioqIFs4aCBLZCAyc10nXG4gICwgJyoqKiBUVVJOICoqKiBbOGggS2QgMnNdIFs2c10nXG4gICwgJyoqKiBSSVZFUiAqKiogWzhoIEtkIDJzIDZzXSBbNHNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnRG1lbGxvSDogc2hvd3MgWzdoIDdkXSAoYSBwYWlyIG9mIFNldmVucyknXG4gICwgJ2hlbGQ6IHNob3dzIFtRZCBRc10gKGEgcGFpciBvZiBRdWVlbnMpJ1xuICAsICdoZWxkIGNvbGxlY3RlZCA1ODY4IGZyb20gc2lkZSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBzaG93cyBbMmMgQWRdIChhIHBhaXIgb2YgRGV1Y2VzKSdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTA0NzUgZnJvbSBtYWluIHBvdCdcbiAgLCAnRmlzY2hlcnNpdG8gZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNHRoIHBsYWNlIGFuZCByZWNlaXZlZCAkNS4xMS4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE2MzQzIE1haW4gcG90IDEwNDc1LiBTaWRlIHBvdCA1ODY4LiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzhoIEtkIDJzIDZzIDRzXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgWzJjIEFkXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBEZXVjZXMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbN2ggN2RdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIFNldmVucydcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIHNob3dlZCBbUWQgUXNdIGFuZCB3b24gKDE2MzQzKSB3aXRoIGEgcGFpciBvZiBRdWVlbnMnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDU0Mjc1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMzOjM1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgzNTI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDc2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzQxNTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDUwNTkgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBZCA5c10nXG4gICwgJ2hlbGQ6IHJhaXNlcyAyNTMzIHRvIDMzMzMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDI1MzMpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDIyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MjA1MTA5NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMTozMzoyMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzkgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMzk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjQyMTQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDM0MjAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICg1MTA5IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzhoIDJoXSdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBJcmlzaGEyJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAxMDAwIGZyb20gcG90J1xuICAsICdJcmlzaGEyOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgY29sbGVjdGVkICgxMDAwKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTIwNDM0NjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6MzI6NTQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDQ4MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MjY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzNDI1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoNDE1OSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs5YyA4c10nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDMzMDkgdG8gNDEwOSBhbmQgaXMgYWxsLWluJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzMwOSkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTgwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTgwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDM1NDQwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMyOjIzIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg0ODc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDMxNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzQ3MDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDM2MDkgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLaCA0Y10nXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQwMCkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTAwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTAwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDcgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDE3MTk1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMxOjE0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg0OTI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDc2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTcxMDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIwNzEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIGJpZyBibGluZCA4MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgVGRdJ1xuICAsICdoZWxkOiByYWlzZXMgMTE5OSB0byAxOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyAxMTk5J1xuICAsICcqKiogRkxPUCAqKiogW0tzIDhoIDljXSdcbiAgLCAnRG1lbGxvSDogYmV0cyA0NTk4J1xuICAsICdoZWxkOiByYWlzZXMgMTQwNjMgdG8gMTg2NjEgYW5kIGlzIGFsbC1pbidcbiAgLCAnRG1lbGxvSDogY2FsbHMgMTA0NTQgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgzNjA5KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICcqKiogVFVSTiAqKiogW0tzIDhoIDljXSBbSmNdJ1xuICAsICcqKiogUklWRVIgKioqIFtLcyA4aCA5YyBKY10gWzZjXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtRZCBLaF0gKGEgcGFpciBvZiBLaW5ncyknXG4gICwgJ2hlbGQ6IHNob3dzIFtBZCBUZF0gKGhpZ2ggY2FyZCBBY2UpJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAzNDcwMiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzQ3MDIgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFtLcyA4aCA5YyBKYyA2Y10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBzaG93ZWQgW1FkIEtoXSBhbmQgd29uICgzNDcwMikgd2l0aCBhIHBhaXIgb2YgS2luZ3MnXG4gICwgJ1NlYXQgOTogaGVsZCBzaG93ZWQgW0FkIFRkXSBhbmQgbG9zdCB3aXRoIGhpZ2ggY2FyZCBBY2UnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDA4MzE1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMwOjQxIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg1Mzc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNjQxNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTQ5NTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIwNzYwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tkIDRkXSdcbiAgLCAnRG1lbGxvSDogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbSmQgMmMgQWNdJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ0RtZWxsb0g6IGJldHMgMTkwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTkwMCkgcmV0dXJuZWQgdG8gRG1lbGxvSCdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgMzgwMCBmcm9tIHBvdCdcbiAgLCAnRG1lbGxvSDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0pkIDJjIEFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBvbiB0aGUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGNvbGxlY3RlZCAoMzgwMCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDkgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDAzNDU4OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMwOjIyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3MDI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDI2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTUwMDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIxMjEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RzIDNzXSdcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbM2QgS2MgS2hdJ1xuICAsICdGaXNjaGVyc2l0bzogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDgwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDgwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMzgwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzNkIEtjIEtoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBjb2xsZWN0ZWQgKDM4MDApJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDEwICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk5MjU0ODogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyOTo0MSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTU4NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE0MTE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNTQ1MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjIwNjAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs0YyAyZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODAwIHRvIDE2MDAnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDE2MDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFszYyBKYyAzaF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDI0MDAnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDI0MDAnXG4gICwgJyoqKiBUVVJOICoqKiBbM2MgSmMgM2hdIFs2aF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMTYwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGNhbGxzIDE2MDAnXG4gICwgJyoqKiBSSVZFUiAqKiogWzNjIEpjIDNoIDZoXSBbM2RdJ1xuICAsICdGaXNjaGVyc2l0bzogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDMyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyAzMjAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnSXJpc2hhMjogc2hvd3MgW0poIFFzXSAoYSBmdWxsIGhvdXNlLCBUaHJlZXMgZnVsbCBvZiBKYWNrcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBtdWNrcyBoYW5kJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAxOTAwMCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTkwMDAgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFszYyBKYyAzaCA2aCAzZF0nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gbXVja2VkIFtUZCBUY10nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBzaG93ZWQgW0poIFFzXSBhbmQgd29uICgxOTAwMCkgd2l0aCBhIGZ1bGwgaG91c2UsIFRocmVlcyBmdWxsIG9mIEphY2tzJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDExICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk4Njk5NDogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyOToyMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTQ1MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE0NTY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNjMwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjIxMTAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBaCAyY10nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoODAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMjAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGNvbGxlY3RlZCAoMjIwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTIgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTgyNzY1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI5OjA1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxNDk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU0MTQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE2MzUxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgyMDc2MCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKaCBUc10nXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgMTA4OCB0byAxODg4J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDEwODgpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBjb2xsZWN0ZWQgKDIyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAxMyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5NzQzNzk6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6Mjg6MzMgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDE1ODI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxNTQ2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTY0MDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE5ODEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzZjIDNjXSdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiBjYWxscyA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJyoqKiBGTE9QICoqKiBbMmMgN2ggNmRdJ1xuICAsICdoZWxkOiBiZXRzIDk5OSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDk5OSkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzJjIDdoIDZkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTgwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDE0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk1Njk1NTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyNzoyOCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTU4NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDExMDkyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNjg1MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjM2ODIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA1ZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogY2FsbHMgODAwJ1xuICAsICcqKiogRkxPUCAqKiogW0FjIDRzIDJjXSdcbiAgLCAnaGVsZDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJyoqKiBUVVJOICoqKiBbQWMgNHMgMmNdIFszaF0nXG4gICwgJ2hlbGQ6IGJldHMgMjIyMidcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDI1NzggdG8gNDgwMCdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjU3OCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgODI0NCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgODI0NCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0FjIDRzIDJjIDNoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBjb2xsZWN0ZWQgKDgyNDQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDE1ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk0NTkzNjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyNjo0NiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDExNTQyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxODUwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjM3MzIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFsyYyBKY10nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogY2FsbHMgODAwJ1xuICAsICcqKiogRkxPUCAqKiogWzhzIDdkIDRjXSdcbiAgLCAnRG1lbGxvSDogY2hlY2tzJ1xuICAsICdGaXNjaGVyc2l0bzogYmV0cyAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxNjAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDM4MDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAzODAwIHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbOHMgN2QgNGNdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGNvbGxlY3RlZCAoMzgwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBvbiB0aGUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTMxMjEzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI1OjUxIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxNDE3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU4ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE4NTUxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxODg5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtUcyBBZF0nXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgMTA4OCB0byAxODg4J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDEwODgnXG4gICwgJyoqKiBGTE9QICoqKiBbOXMgM2ggMmhdJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ2hlbGQ6IGNoZWNrcydcbiAgLCAnKioqIFRVUk4gKioqIFs5cyAzaCAyaF0gWzhzXSdcbiAgLCAnSXJpc2hhMjogYmV0cyAxNjAwJ1xuICAsICdoZWxkOiBjYWxscyAxNjAwJ1xuICAsICcqKiogUklWRVIgKioqIFs5cyAzaCAyaCA4c10gW0tjXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA4MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAzNjQ0IHRvIDQ0NDQnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDM2NDQpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDkxNzYgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDkxNzYgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs5cyAzaCAyaCA4cyBLY10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFJpdmVyJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJ1dHRvbikgY29sbGVjdGVkICg5MTc2KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTcgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTI4MTgzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI1OjM5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMzYyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU5MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE4NjAxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxOTM0NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs1ZCA3c10nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDEwMDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTIxODQ5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjU6MTUgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDEzNjc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxNTk4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTg5NTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE4ODk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVHMgSmhdJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgzMDApIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgODAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgY29sbGVjdGVkICg4MDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAxOSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5MTYyNTI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyNDo1NCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzIgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDYyMDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE2MzMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMjI5OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTg5NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbSnMgOGNdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTU1MiB0byA2MTUyIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyA1NTUyJ1xuICAsICcqKiogRkxPUCAqKiogWzNjIEtjIDZzXSdcbiAgLCAnKioqIFRVUk4gKioqIFszYyBLYyA2c10gW0FjXSdcbiAgLCAnKioqIFJJVkVSICoqKiBbM2MgS2MgNnMgQWNdIFtLZF0nXG4gICwgJyoqKiBTSE9XIERPV04gKioqJ1xuICAsICdEbWVsbG9IOiBzaG93cyBbSmggQWhdICh0d28gcGFpciwgQWNlcyBhbmQgS2luZ3MpJ1xuICAsICdUaG9yZSBIOiBzaG93cyBbUWggNmRdICh0d28gcGFpciwgS2luZ3MgYW5kIFNpeGVzKSdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgMTI4NTQgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNXRoIHBsYWNlIGFuZCByZWNlaXZlZCAkMy42OC4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyODU0IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbM2MgS2MgNnMgQWMgS2RdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChidXR0b24pIHNob3dlZCBbUWggNmRdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEtpbmdzIGFuZCBTaXhlcydcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJpZyBibGluZCkgc2hvd2VkIFtKaCBBaF0gYW5kIHdvbiAoMTI4NTQpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIEtpbmdzJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyMCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5MDkyMzE6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyNDoyNyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDY1NTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE2OTgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMjk0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTcyNDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQXMgOGRdJ1xuICAsICdEbWVsbG9IOiBjYWxscyA2MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAxNjIyIHRvIDIyMjInXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxNjIyKSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAyMzUwIGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMzUwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgyMzUwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMjEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODkzNzU1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjM6MjkgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM5IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDEwNTc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3MjAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxODgzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTI5OTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3ODk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA5c10nXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDYwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ2hlbGQ6IGNhbGxzIDYwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGNhbGxzIDMwMCdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICcqKiogRkxPUCAqKiogWzNkIDZjIFRzXSdcbiAgLCAnRmlzY2hlcnNpdG86IGNoZWNrcydcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ2hlbGQ6IGNoZWNrcydcbiAgLCAnKioqIFRVUk4gKioqIFszZCA2YyBUc10gW0poXSdcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgMTIwMCdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDEyMDAnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICcqKiogUklWRVIgKioqIFszZCA2YyBUcyBKaF0gW1RoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgMjQwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjQwMCkgcmV0dXJuZWQgdG8gRmlzY2hlcnNpdG8nXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA1MDUwIGZyb20gcG90J1xuICAsICdGaXNjaGVyc2l0bzogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNTA1MCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzNkIDZjIFRzIEpoIFRoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoNTA1MCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgb24gdGhlIFJpdmVyJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJ1dHRvbikgZm9sZGVkIG9uIHRoZSBUdXJuJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyMiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4ODY5MDM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMzowMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzQgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTEyMjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDcyNTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE4ODgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMzA0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTcwOTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzhzIEtkXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk1NSB0byAxNTU1J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoOTU1KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAxNDUwIGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxNDUwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgxNDUwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMjMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODgyNjQ2OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjI6NDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDExMjc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg2MTUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxODkzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTMzOTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3NzQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tzIDljXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTUwMiB0byA2MTAyIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNTUwMikgcmV0dXJuZWQgdG8gVGhvcmUgSCdcbiAgLCAnVGhvcmUgSCBjb2xsZWN0ZWQgMTc1MCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTc1MCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBjb2xsZWN0ZWQgKDE3NTApJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg3Nzg3MDogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIyOjI5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMTMyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNTA1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTkyODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE0MDQ5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzc5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs1cyA2aF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyA0NDAyIHRvIDUwMDIgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ0MDIpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDE3NTAgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE3NTAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJ1dHRvbikgY29sbGVjdGVkICgxNzUwKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyNSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4NzM0MDU6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMjoxMiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTEzNzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDU0MDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE5OTMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNDA5OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY2OTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbSmQgQWRdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDEwNjYgdG8gMTY2NidcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTA2NikgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTc1MCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTc1MCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIGNvbGxlY3RlZCAoMTc1MCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI2ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg2NTQ4NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIxOjQyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4Nzc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3ODUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxOTk4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTQxNDkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2NzQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyA1ZF0nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgNjAwIHRvIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDYwMCdcbiAgLCAnKioqIEZMT1AgKioqIFs5YyBKZCA0ZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDEyMDAnXG4gICwgJyoqKiBUVVJOICoqKiBbOWMgSmQgNGRdIFtBZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDYzMjUgYW5kIGlzIGFsbC1pbidcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNjMyNSkgcmV0dXJuZWQgdG8gRmlzY2hlcnNpdG8nXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA1MDUwIGZyb20gcG90J1xuICAsICdGaXNjaGVyc2l0bzogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNTA1MCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzljIEpkIDRkIEFkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoNTA1MCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg1NzUxMzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIxOjEyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4ODI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3OTAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMDAzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjkyMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY0MjYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3Mzk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0toIDVoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IHJhaXNlcyA2MDAgdG8gMTIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHJhaXNlcyA1MTc2IHRvIDYzNzYgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDUxNzYnXG4gICwgJyoqKiBGTE9QICoqKiBbM2MgOXMgMmNdJ1xuICAsICcqKiogVFVSTiAqKiogWzNjIDlzIDJjXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFszYyA5cyAyYyA2ZF0gWzNzXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ3NhcGluaG8xMDAxOiBzaG93cyBbQWMgUWNdIChhIHBhaXIgb2YgVGhyZWVzKSdcbiAgLCAnRG1lbGxvSDogc2hvd3MgW0FzIDlkXSAodHdvIHBhaXIsIE5pbmVzIGFuZCBUaHJlZXMpJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAxMzY1MiBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDEgZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNnRoIHBsYWNlIGFuZCByZWNlaXZlZCAkMi40NS4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEzNjUyIHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbM2MgOXMgMmMgNmQgM3NdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIHNob3dlZCBbQXMgOWRdIGFuZCB3b24gKDEzNjUyKSB3aXRoIHR3byBwYWlyLCBOaW5lcyBhbmQgVGhyZWVzJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChzbWFsbCBibGluZCkgc2hvd2VkIFtBYyBRY10gYW5kIGxvc3Qgd2l0aCBhIHBhaXIgb2YgVGhyZWVzJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyOCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4NDUyMDA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMDoyNSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODg3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNzk1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjAwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwMDM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzExMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc0NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUWMgN3NdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IHJhaXNlcyAxMjAwIHRvIDE4MDAnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMTI2MyB0byAzMDYzIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDEyNjMnXG4gICwgJyoqKiBGTE9QICoqKiBbS2ggNmggM2hdJ1xuICAsICcqKiogVFVSTiAqKiogW0toIDZoIDNoXSBbM2NdJ1xuICAsICcqKiogUklWRVIgKioqIFtLaCA2aCAzaCAzY10gWzVkXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtKYyBBc10gKGEgcGFpciBvZiBUaHJlZXMpJ1xuICAsICdzYXBpbmhvMTAwMTogc2hvd3MgWzloIEtkXSAodHdvIHBhaXIsIEtpbmdzIGFuZCBUaHJlZXMpJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgNjQyNiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjQyNiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0toIDZoIDNoIDNjIDVkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbSmMgQXNdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIFRocmVlcydcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBzaG93ZWQgWzloIEtkXSBhbmQgd29uICg2NDI2KSB3aXRoIHR3byBwYWlyLCBLaW5ncyBhbmQgVGhyZWVzJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyOSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4MzY0NjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxOTo1MiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzIgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODkyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODAwMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTkyMzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwNjg2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzE2MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc0OTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtRcyA1aF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IHJhaXNlcyAxMjAwIHRvIDE4MDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzIFs3cyAzY10nXG4gICwgJ1VuY2FsbGVkIGJldCAoMTIwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMTUwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTUwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTUwMCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzMCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4MjgzNjA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxOToyMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNzE1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTk4ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwNzM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzIxMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc1NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3YyBUY10nXG4gICwgJ3NhcGluaG8xMDAxIHNhaWQsIFwiOihcIidcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDY1MDIgdG8gNzEwMiBhbmQgaXMgYWxsLWluJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg2NTAyKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCAxNTAwIGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxNTAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgxNTAwKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDMxICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTgxOTUxMTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjE4OjQ2IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4ODc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3MDUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxOTkzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTA3ODYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzMjYzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzU5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKZCA5ZF0nXG4gICwgJ1Rob3JlIEggc2FpZCwgXCIuLmkuLlwiJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODIyNSB0byA4ODI1IGFuZCBpcyBhbGwtaW4nXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDY0MDIgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgxODIzKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnKioqIEZMT1AgKioqIFs1cyAyaCA3Y10nXG4gICwgJyoqKiBUVVJOICoqKiBbNXMgMmggN2NdIFs1aF0nXG4gICwgJyoqKiBSSVZFUiAqKiogWzVzIDJoIDdjIDVoXSBbS2hdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnRmlzY2hlcnNpdG86IHNob3dzIFtLZCBKY10gKHR3byBwYWlyLCBLaW5ncyBhbmQgRml2ZXMpJ1xuICAsICdUaG9yZSBIOiBzaG93cyBbSnMgS2NdICh0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzKSdcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDcxNTIgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDcxNTIgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE0MzA0IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNXMgMmggN2MgNWggS2hdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgc2hvd2VkIFtLZCBKY10gYW5kIHdvbiAoNzE1Mikgd2l0aCB0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJpZyBibGluZCkgc2hvd2VkIFtKcyBLY10gYW5kIHdvbiAoNzE1Mikgd2l0aCB0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzIgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODEyNzk0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTg6MjAgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM3IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk1MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDI5NzYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE5OTgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMDgzNiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDYyMzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3OTQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzZjIDVzXSdcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDIzMjYgdG8gMjkyNiBhbmQgaXMgYWxsLWluJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMzI2MyB0byA2MTg5IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzI2MykgcmV0dXJuZWQgdG8gc2FwaW5obzEwMDEnXG4gICwgJyoqKiBGTE9QICoqKiBbOGggM2ggS2NdJ1xuICAsICcqKiogVFVSTiAqKiogWzhoIDNoIEtjXSBbOWRdJ1xuICAsICcqKiogUklWRVIgKioqIFs4aCAzaCBLYyA5ZF0gWzVoXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ1Rob3JlIEg6IHNob3dzIFs5aCBUaF0gKGEgZmx1c2gsIFRlbiBoaWdoKSdcbiAgLCAnc2FwaW5obzEwMDE6IHNob3dzIFtKcyBRZF0gKGhpZ2ggY2FyZCBLaW5nKSdcbiAgLCAnVGhvcmUgSCBjb2xsZWN0ZWQgNzA1MiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNzA1MiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzhoIDNoIEtjIDlkIDVoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgWzloIFRoXSBhbmQgd29uICg3MDUyKSB3aXRoIGEgZmx1c2gsIFRlbiBoaWdoJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIHNob3dlZCBbSnMgUWRdIGFuZCBsb3N0IHdpdGggaGlnaCBjYXJkIEtpbmcnXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODA2ODM4OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTc6NTggRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk1NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEyMzggaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIwMDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMDg4NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY1ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE5MTgyIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzljIDZoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTg4IHRvIDExODggYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IGNhbGxzIDU4OCdcbiAgLCAnKioqIEZMT1AgKioqIFs1cyA2cyA3Y10nXG4gICwgJyoqKiBUVVJOICoqKiBbNXMgNnMgN2NdIFtBc10nXG4gICwgJyoqKiBSSVZFUiAqKiogWzVzIDZzIDdjIEFzXSBbNWRdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnaGVsZDogc2hvd3MgWzljIDZoXSAodHdvIHBhaXIsIFNpeGVzIGFuZCBGaXZlcyknXG4gICwgJ1Rob3JlIEg6IHNob3dzIFtBaCAzZF0gKHR3byBwYWlyLCBBY2VzIGFuZCBGaXZlcyknXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDI5NzYgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggc2FpZCwgXCJuaCAgdyBhbmtlclwiJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyOTc2IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNXMgNnMgN2MgQXMgNWRdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIHNob3dlZCBbQWggM2RdIGFuZCB3b24gKDI5NzYpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgc2hvd2VkIFs5YyA2aF0gYW5kIGxvc3Qgd2l0aCB0d28gcGFpciwgU2l4ZXMgYW5kIEZpdmVzJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzNCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3OTU5OTY6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxNzoxNiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoOTYyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNjI4MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjAwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUwNDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg3MjM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxOTIzMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3cyA4ZF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyA1NjMxIHRvIDYyMzEgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDQ2OTMgYW5kIGlzIGFsbC1pbidcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDEyMzgpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJyoqKiBGTE9QICoqKiBbNWQgM3MgUWRdJ1xuICAsICcqKiogVFVSTiAqKiogWzVkIDNzIFFkXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFs1ZCAzcyBRZCA2ZF0gW1FoXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtLZCBRc10gKHRocmVlIG9mIGEga2luZCwgUXVlZW5zKSdcbiAgLCAnVGhvcmUgSDogc2hvd3MgWzJoIEFkXSAoYSBwYWlyIG9mIFF1ZWVucyknXG4gICwgJ0RtZWxsb0ggY29sbGVjdGVkIDEwODg2IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDg4NiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzVkIDNzIFFkIDZkIFFoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgWzJoIEFkXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBRdWVlbnMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbS2QgUXNdIGFuZCB3b24gKDEwODg2KSB3aXRoIHRocmVlIG9mIGEga2luZCwgUXVlZW5zJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzUgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzg1NzU5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTY6MzYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk2NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDc4ODYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIwNDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1NjkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNzI4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY1MjcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyBKZF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk1NSB0byAxNTU1J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDE1NTUnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFtRcyAzZCA2Y10nXG4gICwgJ2hlbGQ6IGJldHMgMzMzMydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzMzMykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNDMxMCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNDMxMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW1FzIDNkIDZjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDQzMTApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzNiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3ODIwNjM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxNjoyMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoOTcyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODIzNiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjEwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDQ1NDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg3MzM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjU3NyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzVoIFFjXSdcbiAgLCAnRG1lbGxvSDogcmFpc2VzIDM4OTMgdG8gNDQ5MyBhbmQgaXMgYWxsLWluJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgzODkzKSByZXR1cm5lZCB0byBEbWVsbG9IJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAxODAwIGZyb20gcG90J1xuICAsICdEbWVsbG9IOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxODAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggY29sbGVjdGVkICgxODAwKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDM3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTc3MDY3NzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjE1OjM5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMDA3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODg4NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjExMzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUxOTMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1NTg5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjYyNyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA1aF0nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyA2MDAnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgNDkzOSB0byA1NTM5IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg0OTM5KSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDI0MDAgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyNDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGNvbGxlY3RlZCAoMjQwMCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDM4ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTc2MjkwNjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxNTowOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTA1MDAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg5MTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxMTU1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MjE4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNDg2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY4NTIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbNHMgSmNdJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDQ0MzkgdG8gNDgzOSBhbmQgaXMgYWxsLWluJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ0MzkpIHJldHVybmVkIHRvIHNhcGluaG8xMDAxJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgMTE1MCBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDE6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDExNTAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIGNvbGxlY3RlZCAoMTE1MCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzkgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzQ5MTQ1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjE0OjE3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2NzcwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg4OTM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMTE4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTI0MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDMyMDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1Mjg5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjg3NyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3aCBRaF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxMjAwJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogcmFpc2VzIDE5ODAgdG8gMzE4MCBhbmQgaXMgYWxsLWluJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyAxOTgwJ1xuICAsICcqKiogRkxPUCAqKiogW0poIFRzIDVkXSdcbiAgLCAnKioqIFRVUk4gKioqIFtKaCBUcyA1ZF0gW1RoXSdcbiAgLCAnKioqIFJJVkVSICoqKiBbSmggVHMgNWQgVGhdIFtRZF0nXG4gICwgJyoqKiBTSE9XIERPV04gKioqJ1xuICAsICdaYW51c3NvZjogc2hvd3MgW0FjIEpzXSAodHdvIHBhaXIsIEphY2tzIGFuZCBUZW5zKSdcbiAgLCAnRmlzY2hlcnNpdG86IHNob3dzIFtUYyA5Y10gKHRocmVlIG9mIGEga2luZCwgVGVucyknXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA2OTM1IGZyb20gcG90J1xuICAsICdaYW51c3NvZiBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiA3dGggcGxhY2UgYW5kIHJlY2VpdmVkICQxLjQzLidcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjkzNSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0poIFRzIDVkIFRoIFFkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgW1RjIDljXSBhbmQgd29uICg2OTM1KSB3aXRoIHRocmVlIG9mIGEga2luZCwgVGVucydcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoc21hbGwgYmxpbmQpIHNob3dlZCBbQWMgSnNdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEphY2tzIGFuZCBUZW5zJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNDAgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzQzMjE0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjEzOjU0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2Nzk1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg4MTg2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMTIwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTQ2OCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDM2MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1MzE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjkwMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1phbnVzc29mOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RoIEtkXSdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNDAwIHRvIDgwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCAxMTc1IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMTc1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGNvbGxlY3RlZCAoMTE3NSknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MzgwMjQ6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTM6MzUgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDgyMTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxNDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTE4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzY1NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDUzMzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTI3IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFszcyA5ZF0nXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjAwKSByZXR1cm5lZCB0byBEbWVsbG9IJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCA1NzUgZnJvbSBwb3QnXG4gICwgJ0RtZWxsb0g6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDU3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoNTc1KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MjgwMDg6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTI6NTYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMxIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4NDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg0MzYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxODU1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTQzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzY4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDQ1ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTUyIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBaCA4Y10nXG4gICwgJ0lyaXNoYTIgc2FpZCwgXCImJiYmXCInXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ1Rob3JlIEggc2FpZCwgXCJob3BlIHUgZGllIGZhc3RcIidcbiAgLCAnSXJpc2hhMiBzYWlkLCBcIj8/Pz8/Pz8/Pz8/P1wiJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDgwMCB0byAxMjAwJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoODAwKSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDExNzUgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMTc1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgKDExNzUpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MjIyNjc6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTI6MzQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM5IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDcwNzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg4NjEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxODgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTY4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzcwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM4MzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTc3IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgOWhdJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnVGhvcmUgSCBzYWlkLCBcInJ1c3NpYW4gIGIgYXN0YXJkXCInXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMzQxNCB0byAzODE0IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDM0MTQpIHJldHVybmVkIHRvIHNhcGluaG8xMDAxJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgMTE3NSBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDE6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDExNzUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGNvbGxlY3RlZCAoMTE3NSknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDQ0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTcwNzI3ODogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxMTozNiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoNzQ5NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTkwODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDEwMjI0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzczMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICg3MDcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzODY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzIwMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tkIDloXSdcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDQwMCB0byA4MDAnXG4gICwgJ0lyaXNoYTI6IHJhaXNlcyA4MDAgdG8gMTYwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBjYWxscyA2ODIgYW5kIGlzIGFsbC1pbidcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbQXMgUXMgNWhdJ1xuICAsICdUaG9yZSBIOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMTYwMCdcbiAgLCAnVGhvcmUgSDogY2FsbHMgMTYwMCdcbiAgLCAnKioqIFRVUk4gKioqIFtBcyBRcyA1aF0gWzhjXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDI4MDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDI4MDAnXG4gICwgJyoqKiBSSVZFUiAqKiogW0FzIFFzIDVoIDhjXSBbUWNdJ1xuICAsICdUaG9yZSBIOiBiZXRzIDEzMDYwIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDQxOTkgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICg4ODYxKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnVGhvcmUgSDogc2hvd3MgW0FjIFRoXSAodHdvIHBhaXIsIEFjZXMgYW5kIFF1ZWVucyknXG4gICwgJ0lyaXNoYTI6IHNob3dzIFtBaCBRaF0gKGEgZnVsbCBob3VzZSwgUXVlZW5zIGZ1bGwgb2YgQWNlcyknXG4gICwgJ0lyaXNoYTIgY29sbGVjdGVkIDE5MDM0IGZyb20gc2lkZSBwb3QnXG4gICwgJ21vcmVuYTIxMTogc2hvd3MgWzZoIDZjXSAodHdvIHBhaXIsIFF1ZWVucyBhbmQgU2l4ZXMpJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAyODQ2IGZyb20gbWFpbiBwb3QnXG4gICwgJ21vcmVuYTIxMSBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiA4dGggcGxhY2UnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIxODgwIE1haW4gcG90IDI4NDYuIFNpZGUgcG90IDE5MDM0LiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0FzIFFzIDVoIDhjIFFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgW0FjIFRoXSBhbmQgbG9zdCB3aXRoIHR3byBwYWlyLCBBY2VzIGFuZCBRdWVlbnMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBzaG93ZWQgW0FoIFFoXSBhbmQgd29uICgyMTg4MCkgd2l0aCBhIGZ1bGwgaG91c2UsIFF1ZWVucyBmdWxsIG9mIEFjZXMnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBzaG93ZWQgWzZoIDZjXSBhbmQgbG9zdCB3aXRoIHR3byBwYWlyLCBRdWVlbnMgYW5kIFNpeGVzJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0NSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2OTk2MTk6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTE6MDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY3MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MTEwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxMDI0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTIxOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDM3NTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNzMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNDA4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc2MjcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs5ZCBBaF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg4MDApIHJldHVybmVkIHRvIEZpc2NoZXJzaXRvJ1xuICAsICdGaXNjaGVyc2l0byBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnRmlzY2hlcnNpdG86IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gY29sbGVjdGVkICgxMjAwKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNDYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjkxMjY1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjEwOjM1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2NzQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTEzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAyNzQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUyNDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICgzNzgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDExNTcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNTE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzY1MiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUXMgNmRdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgMjAwJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDEwMDAgdG8gMTQwMCdcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMDAwKSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDEwMDAgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDQ3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTY4MzQ0NzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxMDowNSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzQgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoNjc3MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTkxNjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDEwMjk5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MjY4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDAwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNTgyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzUzOSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY4NzcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0FzIDhzXSdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgNzU3IHRvIDExNTcnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDc1NykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTIwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDEyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0OCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2NzY5NzM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDk6NDEgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY3OTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MTg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg5NTI0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1NDkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDQzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNjA3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzU2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY5MDIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdaYW51c3NvZjogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyA5c10nXG4gICwgJ21vcmVuYTIxMTogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDQwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBjaGVja3MnXG4gICwgJyoqKiBGTE9QICoqKiBbSmggNWMgQWNdJ1xuICAsICdaYW51c3NvZjogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDQwMCdcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTIwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0poIDVjIEFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBjb2xsZWN0ZWQgKDEyMDApJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKGJpZyBibGluZCkgZm9sZGVkIG9uIHRoZSBGbG9wJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0OSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2NjE2MTY6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDg6NDMgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MjEwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg5NzQ5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg2NTE3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDQ1NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNjMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzU4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTU1MjggaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RzIEFjXSdcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA1OTkgdG8gOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogY2FsbHMgNTk5J1xuICAsICcqKiogRkxPUCAqKiogWzRjIEpkIEpjXSdcbiAgLCAnRG1lbGxvSDogY2hlY2tzJ1xuICAsICdoZWxkOiBiZXRzIDExMTEnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDExMTEpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIzOTggZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIzOTggfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs0YyBKZCBKY10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgyMzk4KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTAgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjU1MTgwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA4OjE4IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2ODQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTQzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAxNzQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDY1NDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICg0NDgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDE2NTcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNjE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNDc1MyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbS2QgUWRdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA1OTkgdG8gOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg1OTkpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDEyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgxMjAwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjM4MzkzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA3OjE1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3MDcwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTg2MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAxOTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDY1NjcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICg0NTA1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDE2ODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNjM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA4OiBjZWxpYW9idXRsZWUgKDI4OTMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDExMDg1IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ21vcmVuYTIxMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVGQgVGNdJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IHJhaXNlcyA0MDAgdG8gODAwJ1xuICAsICdoZWxkOiByYWlzZXMgMTE5OSB0byAxOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IGNhbGxzIDExOTknXG4gICwgJyoqKiBGTE9QICoqKiBbNGggS2MgQWhdJ1xuICAsICdjZWxpYW9idXRsZWU6IGNoZWNrcydcbiAgLCAnaGVsZDogYmV0cyA4NjknXG4gICwgJ2NlbGlhb2J1dGxlZTogY2FsbHMgODY5IGFuZCBpcyBhbGwtaW4nXG4gICwgJyoqKiBUVVJOICoqKiBbNGggS2MgQWhdIFtBZF0nXG4gICwgJyoqKiBSSVZFUiAqKiogWzRoIEtjIEFoIEFkXSBbNnNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnY2VsaWFvYnV0bGVlOiBzaG93cyBbSmMgUXNdIChhIHBhaXIgb2YgQWNlcyknXG4gICwgJ2hlbGQ6IHNob3dzIFtUZCBUY10gKHR3byBwYWlyLCBBY2VzIGFuZCBUZW5zKSdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNjU2MSBmcm9tIHBvdCdcbiAgLCAnY2VsaWFvYnV0bGVlIGZpbmlzaGVkIHRoZSB0b3VybmFtZW50IGluIDl0aCBwbGFjZSdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjU2MSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzRoIEtjIEFoIEFkIDZzXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIHNob3dlZCBbSmMgUXNdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIEFjZXMnXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBzaG93ZWQgW1RkIFRjXSBhbmQgd29uICg2NTYxKSB3aXRoIHR3byBwYWlyLCBBY2VzIGFuZCBUZW5zJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2MzEwNjQ6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDY6NDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM4IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDc0OTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5ODg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxMDIyNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjU5MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoMTcwNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM2NjQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoMzcxOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoOTY4NSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0poIEFzXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2NlbGlhb2J1dGxlZTogcmFpc2VzIDQwMCB0byA4MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAxMTk5IHRvIDE5OTknXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnY2VsaWFvYnV0bGVlOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMTk5KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAyMjI1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMjI1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgyMjI1KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjIyNDQ1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA2OjE0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3NTIwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTkxMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoNjYyNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjYxNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1NTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNDUzMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM2ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoMzk0MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTAxMTAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdjZWxpYW9idXRsZWU6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbN2QgNWhdJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgMTIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFsyaCAyYyAzY10nXG4gICwgJ0lyaXNoYTI6IGJldHMgNDAwJ1xuICAsICdtb3JlbmEyMTE6IGNhbGxzIDQwMCdcbiAgLCAnKioqIFRVUk4gKioqIFsyaCAyYyAzY10gWzRkXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA0MDAnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgNDAwJ1xuICAsICcqKiogUklWRVIgKioqIFsyaCAyYyAzYyA0ZF0gWzNzXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA4MDAnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgODAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnSXJpc2hhMjogc2hvd3MgW0FkIFFzXSAodHdvIHBhaXIsIFRocmVlcyBhbmQgRGV1Y2VzKSdcbiAgLCAnbW9yZW5hMjExOiBtdWNrcyBoYW5kJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCA2NDI1IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA2NDI1IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbMmggMmMgM2MgNGQgM3NdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIHNob3dlZCBbQWQgUXNdIGFuZCB3b24gKDY0MjUpIHdpdGggdHdvIHBhaXIsIFRocmVlcyBhbmQgRGV1Y2VzJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgbXVja2VkIFtUaCBLZF0nXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTQgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjExMTczOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA1OjMyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3NTQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTkzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoNjY0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzAyMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNDU1NyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY3MTAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoNDM2OCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTAxMzUgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdjZWxpYW9idXRsZWU6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzJjIDdjXSdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IHJhaXNlcyAzMDI1IHRvIDQyMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDE3OTYgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMjI5KSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnKioqIEZMT1AgKioqIFtRaCA2YyBKaF0nXG4gICwgJyoqKiBUVVJOICoqKiBbUWggNmMgSmhdIFtUaF0nXG4gICwgJyoqKiBSSVZFUiAqKiogW1FoIDZjIEpoIFRoXSBbOWNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnc2FwaW5obzEwMDE6IHNob3dzIFs4aCA4c10gKGEgc3RyYWlnaHQsIEVpZ2h0IHRvIFF1ZWVuKSdcbiAgLCAnRG1lbGxvSDogc2hvd3MgW0toIEtjXSAoYSBzdHJhaWdodCwgTmluZSB0byBLaW5nKSdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgNjYxNyBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjYxNyB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW1FoIDZjIEpoIFRoIDljXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBzaG93ZWQgW0toIEtjXSBhbmQgd29uICg2NjE3KSB3aXRoIGEgc3RyYWlnaHQsIE5pbmUgdG8gS2luZydcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoc21hbGwgYmxpbmQpIHNob3dlZCBbOGggOHNdIGFuZCBsb3N0IHdpdGggYSBzdHJhaWdodCwgRWlnaHQgdG8gUXVlZW4nXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTUgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTkzOTQ0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDQ6MjYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM1IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDUyNDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5OTYwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg2Njc0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzMDQ2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDYwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICg2MzgyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNzAzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlICg0MzkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxMDE2MCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHNtYWxsIGJsaW5kIDE1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVGQgUWRdJ1xuICAsICdjZWxpYW9idXRsZWU6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IHJhaXNlcyAzMDAgdG8gNjAwJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgNDUwJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJyoqKiBGTE9QICoqKiBbS2MgQWggNmhdJ1xuICAsICdtb3JlbmEyMTE6IGNoZWNrcydcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgOTAwJ1xuICAsICdtb3JlbmEyMTE6IGNhbGxzIDkwMCdcbiAgLCAnKioqIFRVUk4gKioqIFtLYyBBaCA2aF0gWzVkXSdcbiAgLCAnbW9yZW5hMjExOiBjaGVja3MnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJyoqKiBSSVZFUiAqKiogW0tjIEFoIDZoIDVkXSBbOGRdJ1xuICAsICdtb3JlbmEyMTE6IGJldHMgMzAwJ1xuICAsICdGaXNjaGVyc2l0bzogY2FsbHMgMzAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnbW9yZW5hMjExOiBzaG93cyBbVGggS3NdIChhIHBhaXIgb2YgS2luZ3MpJ1xuICAsICdGaXNjaGVyc2l0bzogc2hvd3MgW0FzIDdzXSAoYSBwYWlyIG9mIEFjZXMpJ1xuICAsICdGaXNjaGVyc2l0byBjb2xsZWN0ZWQgNDEyNSBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNDEyNSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0tjIEFoIDZoIDVkIDhkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgW0FzIDdzXSBhbmQgd29uICg0MTI1KSB3aXRoIGEgcGFpciBvZiBBY2VzJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKHNtYWxsIGJsaW5kKSBzaG93ZWQgW1RoIEtzXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBLaW5ncydcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTczNDAwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDM6MDggRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICMxIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoMTAxODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE0NzE2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBGaXNjaGVyc2l0byAoNTU3MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDgyMzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDM2OTQgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDMwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtRYyAyaF0nXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgODc1IHRvIDExNzUnXG4gICwgJ3NoaWJhYmE0MjA6IHJhaXNlcyAyNDk0IHRvIDM2NjkgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyAxMTAyMiB0byAxNDY5MSBhbmQgaXMgYWxsLWluJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMTAyMikgcmV0dXJuZWQgdG8gVGhvcmUgSCdcbiAgLCAnKioqIEZMT1AgKioqIFtBZCBUZCA5aF0nXG4gICwgJyoqKiBUVVJOICoqKiBbQWQgVGQgOWhdIFs0ZF0nXG4gICwgJyoqKiBSSVZFUiAqKiogW0FkIFRkIDloIDRkXSBbOWRdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnVGhvcmUgSDogc2hvd3MgW0toIEtkXSAoYSBmbHVzaCwgQWNlIGhpZ2gpJ1xuICAsICdzaGliYWJhNDIwOiBzaG93cyBbUWggQWNdICh0d28gcGFpciwgQWNlcyBhbmQgTmluZXMpJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCA4OTM4IGZyb20gcG90J1xuICAsICdzaGliYWJhNDIwIGZpbmlzaGVkIHRoZSB0b3VybmFtZW50IGluIDEwdGggcGxhY2UnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg5MzggfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFtBZCBUZCA5aCA0ZCA5ZF0nXG4gICwgJ1NlYXQgMTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbS2ggS2RdIGFuZCB3b24gKDg5MzgpIHdpdGggYSBmbHVzaCwgQWNlIGhpZ2gnXG4gICwgJ1NlYXQgMzogRmlzY2hlcnNpdG8gKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIHNob3dlZCBbUWggQWNdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIE5pbmVzJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1NyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE1NTgzNDI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMTowMjoxMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDM2MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTMxNjYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg5NTg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICgzNzE5IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbNmQgVGNdJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDMwMCB0byA2MDAnXG4gICwgJ3NoaWJhYmE0MjA6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogY2FsbHMgMzAwJ1xuICAsICcqKiogRkxPUCAqKiogWzJoIDdkIDlkXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdzYXBpbmhvMTAwMTogYmV0cyA3MjUnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDcyNSdcbiAgLCAnKioqIFRVUk4gKioqIFsyaCA3ZCA5ZF0gW0tkXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdzYXBpbmhvMTAwMTogY2hlY2tzJ1xuICAsICcqKiogUklWRVIgKioqIFsyaCA3ZCA5ZCBLZF0gWzVoXSdcbiAgLCAnVGhvcmUgSDogYmV0cyA2MDAnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg2MDApIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDI5MDAgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDI5MDAgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFsyaCA3ZCA5ZCBLZCA1aF0nXG4gICwgJ1NlYXQgMTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMjkwMCknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgZm9sZGVkIG9uIHRoZSBSaXZlcidcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTUwNzY5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDE6NDAgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoMTA2ODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEzMTkxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoMTU4MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDc0NzggaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDM4OTQgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2hpYmFiYTQyMDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzdkIFRkXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0x1a2F6NTE2OiByYWlzZXMgMTI1NyB0byAxNTU3IGFuZCBpcyBhbGwtaW4nXG4gICwgJ3NhcGluaG8xMDAxOiBjYWxscyAxNTU3J1xuICAsICdzaGliYWJhNDIwOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJyoqKiBGTE9QICoqKiBbNGMgN3MgM2RdJ1xuICAsICcqKiogVFVSTiAqKiogWzRjIDdzIDNkXSBbQWRdJ1xuICAsICcqKiogUklWRVIgKioqIFs0YyA3cyAzZCBBZF0gW0pkXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0x1a2F6NTE2OiBzaG93cyBbSmggUWhdIChhIHBhaXIgb2YgSmFja3MpJ1xuICAsICdzYXBpbmhvMTAwMTogc2hvd3MgWzdoIEFzXSAodHdvIHBhaXIsIEFjZXMgYW5kIFNldmVucyknXG4gICwgJ3NhcGluaG8xMDAxIGNvbGxlY3RlZCAzNjg5IGZyb20gcG90J1xuICAsICdMdWthejUxNiBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiAxMXRoIHBsYWNlJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAzNjg5IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNGMgN3MgM2QgQWQgSmRdJ1xuICAsICdTZWF0IDE6IGhlbGQgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2IHNob3dlZCBbSmggUWhdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIEphY2tzJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIChidXR0b24pIHNob3dlZCBbN2ggQXNdIGFuZCB3b24gKDM2ODkpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIFNldmVucydcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1OSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE1NDU0MzA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMTowMToxOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzUgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDcxMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTI2NDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgxNjA3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoNzY1MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDIxOSBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzJjIDRoXSdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyAzMDAgdG8gNjAwJ1xuICAsICdMdWthejUxNjogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzAwKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCA4NzUgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGNvbGxlY3RlZCAoODc1KSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYwICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTUyOTQ5NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFZJSUkgKDE1MC8zMDApIC0gMjAxNi8wMy8wMSAxOjAwOjE3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDJcXCcgOS1tYXggU2VhdCAjMiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IGhlbGQgKDEwMTYwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxMjY2NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgKDE3ODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg3OTc4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICg0MjQ0IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdMdWthejUxNjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2hpYmFiYTQyMDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0FoIDhkXSdcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA0NzcgdG8gNzc3J1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDc3KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCA4NzUgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBoZWxkIGNvbGxlY3RlZCAoODc1KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYxICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTQ1MTk4NTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFZJSUkgKDE1MC8zMDApIC0gMjAxNi8wMy8wMSAwOjU0OjU3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDJcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IGhlbGQgKDk2MTAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEyODQxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoMjEwNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDgwMDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDQyNjkgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdMdWthejUxNjogcG9zdHMgYmlnIGJsaW5kIDMwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs4cyBKZF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA0NzcgdG8gNzc3J1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ3NykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgODc1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA4NzUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoYnV0dG9uKSBjb2xsZWN0ZWQgKDg3NSknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA2MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE0Mzk5OTc6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMDo1NDoxMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDMwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTIwNzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgyMTMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoODAyOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDI5NCBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUWQgVHNdJ1xuICAsICdMdWthejUxNjogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyAzNjYgdG8gNjY2J1xuICAsICdUaG9yZSBIOiByYWlzZXMgMTEzODQgdG8gMTIwNTAgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTEzODQpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDE0NTcgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEg6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE0NTcgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTQ1NyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNjMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNDMwMDYzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDA6NTM6MzYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoOTkwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTIxMDAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgyMTU3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoODA1MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDYxOSBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgOWhdJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ3NoaWJhYmE0MjA6IGNhbGxzIDE1MCdcbiAgLCAnaGVsZDogcmFpc2VzIDEwMzMgdG8gMTMzMydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTAzMykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNzI1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA3MjUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoYmlnIGJsaW5kKSBjb2xsZWN0ZWQgKDcyNSknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA2NCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE0MTIxMzI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMDo1MjoyOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzUgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICg4MDg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxMzM5MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgKDIxODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg4MjI4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICg0OTQ0IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG5dLmpvaW4oJ1xcbicpXG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IGluamVjdFN0eWxlICAgICA9IHJlcXVpcmUoJy4vbGliL2luamVjdC1zdHlsZScpXG5jb25zdCB0ZW1wbGF0ZXMgICAgICAgPSByZXF1aXJlKCcuL2xpYi90ZW1wbGF0ZXMnKVxuY29uc3Qgc29ydCAgICAgICAgICAgID0gcmVxdWlyZSgnLi9saWIvc29ydCcpXG5jb25zdCBjc3MgICAgICAgICAgICAgPSB0ZW1wbGF0ZXMuY3NzXG5jb25zdCBmaWx0ZXJDc3MgICAgICAgPSB0ZW1wbGF0ZXMuZmlsdGVyQ3NzXG5jb25zdCBzZWxlY3RQbGF5ZXJDc3MgPSB0ZW1wbGF0ZXMuc2VsZWN0UGxheWVyQ3NzXG5jb25zdCB1aUZpbHRlciAgICAgICAgPSB0ZW1wbGF0ZXMudWlGaWx0ZXJcbmNvbnN0IGhlYWQgICAgICAgICAgICA9IHRlbXBsYXRlcy5oZWFkKHsgY3NzOiBjc3MgfSlcbmNvbnN0IGhvbGRlbSAgICAgICAgICA9IHRlbXBsYXRlcy5ob2xkZW1cblxuZnVuY3Rpb24gb25lRGVjaW1hbCAoeCkge1xuICByZXR1cm4gKHggfHwgMCkudG9GaXhlZCgxKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdWl0IChzKSB7XG4gIHN3aXRjaCAocykge1xuICAgIGNhc2UgJ3MnOiByZXR1cm4gJ+KZoCdcbiAgICBjYXNlICdoJzogcmV0dXJuICfimaUnXG4gICAgY2FzZSAnZCc6IHJldHVybiAn4pmmJ1xuICAgIGNhc2UgJ2MnOiByZXR1cm4gJ+KZoydcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJDYXJkIChjKSB7XG4gIGlmICh0eXBlb2YgYyA9PT0gJ3VuZGVmaW5lZCcgfHwgYy5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgY29uc3Qgc3VpdCA9IHJlbmRlclN1aXQoY1sxXSlcbiAgcmV0dXJuICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXZhbHVlXCI+J1xuICAgICAgICAgICAgKyBjWzBdICtcbiAgICAgICAgICAnPC9zcGFuPicgK1xuICAgICAgICAgICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXN1aXQgJyArIGNbMV0gKyAnXCI+J1xuICAgICAgICAgICAgKyBzdWl0ICtcbiAgICAgICAgICAnPC9zcGFuPidcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ2FyZHMgKGNhcmRzKSB7XG4gIGlmICghY2FyZHMpIHJldHVybiAnJ1xuICBmdW5jdGlvbiByZW5kZXIgKGFjYywgaykge1xuICAgIGFjY1trXSA9IHJlbmRlckNhcmQoY2FyZHNba10pXG4gICAgcmV0dXJuIGFjY1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhjYXJkcykucmVkdWNlKHJlbmRlciwge30pXG59XG5cbmZ1bmN0aW9uIHNob3J0ZW5BY3Rpb25UeXBlICh0eXBlKSB7XG4gIHJldHVybiAgdHlwZSA9PT0gJ2ZvbGQnICAgICA/ICdGJ1xuICAgICAgICA6IHR5cGUgPT09ICdjaGVjaycgICAgPyAnWCdcbiAgICAgICAgOiB0eXBlID09PSAnY2FsbCcgICAgID8gJ0MnXG4gICAgICAgIDogdHlwZSA9PT0gJ2JldCcgICAgICA/ICdCJ1xuICAgICAgICA6IHR5cGUgPT09ICdyYWlzZScgICAgPyAnUidcbiAgICAgICAgOiB0eXBlID09PSAnY29sbGVjdCcgID8gJ1cnXG4gICAgICAgIDogKGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gYWN0aW9uIHR5cGUnLCB0eXBlKSwgJz8nKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJlZXQgKGFjdGlvbnMsIGluZGVudCkge1xuICBsZXQgcyA9IGluZGVudCA/ICdfX19fXyAnIDogJydcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYSA9IGFjdGlvbnNbaV1cbiAgICAvLyBpZ25vcmUgdW5jYWxsZWQgYmV0cyByZXR1cm5lZFxuICAgIGlmIChhLnR5cGUgPT09ICdiZXQtcmV0dXJuZWQnKSBjb250aW51ZVxuICAgIHMgKz0gIHNob3J0ZW5BY3Rpb25UeXBlKGEudHlwZSkgKyAnICdcbiAgICAgICAgKyAoYS5oYXNPd25Qcm9wZXJ0eSgncmF0aW8nKVxuICAgICAgICAgICAgPyBvbmVEZWNpbWFsKGEucmF0aW8pXG4gICAgICAgICAgICA6ICcgICAnKVxuICAgICAgICArIChhLmFsbGluID8gJyBBJyA6ICcnKVxuICAgICAgICArICcgJ1xuICB9XG4gIHJldHVybiBzLnRyaW0oKVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQbGF5ZXJOYW1lIChuKSB7XG4gIHJldHVybiBuLnJlcGxhY2UoLyAvZywgJ18nKVxufVxuXG5mdW5jdGlvbiBuYW1lUGxheWVyIChwKSB7IHJldHVybiBwLm5hbWUgfVxuXG5mdW5jdGlvbiByZW5kZXJQbGF5ZXIgKHApIHtcbiAgY29uc3QgaW5mbyA9IHtcbiAgICAgIHBvcyAgICAgICAgICAgIDogKHAucG9zIHx8ICc/PycpLnRvVXBwZXJDYXNlKClcbiAgICAsIG5hbWUgICAgICAgICAgIDogcC5uYW1lXG4gICAgLCBub3JtYWxpemVkTmFtZSA6IG5vcm1hbGl6ZVBsYXllck5hbWUocC5uYW1lKVxuICAgICwgY2FyZHMgICAgICAgICAgOiBwLmNhcmRzXG4gICAgLCByZW5kZXJlZENhcmRzICA6IHJlbmRlckNhcmRzKHAuY2FyZHMpXG4gICAgLCBtICAgICAgICAgICAgICA6IHAubVxuICAgICwgcHJlZmxvcCAgICAgICAgOiByZW5kZXJTdHJlZXQocC5wcmVmbG9wLCBwLmJiIHx8IHAuc2IpXG4gICAgLCBmbG9wICAgICAgICAgICA6IHJlbmRlclN0cmVldChwLmZsb3AsIGZhbHNlKVxuICAgICwgdHVybiAgICAgICAgICAgOiByZW5kZXJTdHJlZXQocC50dXJuLCBmYWxzZSlcbiAgICAsIHJpdmVyICAgICAgICAgIDogcmVuZGVyU3RyZWV0KHAucml2ZXIsIGZhbHNlKVxuICAgICwgc2hvd2Rvd24gICAgICAgOiByZW5kZXJTdHJlZXQocC5zaG93ZG93biwgZmFsc2UpXG4gIH1cbiAgbGV0IHBsYXllckFjdGl2aXR5ID0gaW5mby5ub3JtYWxpemVkTmFtZVxuICBpZiAocC5pbnZlc3RlZCkgcGxheWVyQWN0aXZpdHkgKz0gJyBpbnZlc3RlZCdcbiAgaWYgKHAuc2F3RmxvcCkgcGxheWVyQWN0aXZpdHkgKz0gJyBzYXdGbG9wJ1xuICBpbmZvLnBsYXllckFjdGl2aXR5ID0gcGxheWVyQWN0aXZpdHlcbiAgcmV0dXJuIGluZm9cbn1cblxuZnVuY3Rpb24gcmVuZGVySW5mbyAoYW5hbHl6ZWQsIHBsYXllcnMpIHtcbiAgY29uc3QgaW5mbyA9IHtcbiAgICAgIGJiICAgICAgIDogYW5hbHl6ZWQuYmJcbiAgICAsIHNiICAgICAgIDogYW5hbHl6ZWQuc2JcbiAgICAsIGFudGUgICAgIDogYW5hbHl6ZWQuYW50ZVxuICAgICwgYm9hcmQgICAgOiBhbmFseXplZC5ib2FyZFxuICAgICwgeWVhciAgICAgOiBhbmFseXplZC55ZWFyXG4gICAgLCBtb250aCAgICA6IGFuYWx5emVkLm1vbnRoXG4gICAgLCBkYXkgICAgICA6IGFuYWx5emVkLmRheVxuICAgICwgaG91ciAgICAgOiBhbmFseXplZC5ob3VyXG4gICAgLCBtaW4gICAgICA6IGFuYWx5emVkLm1pblxuICAgICwgc2VjICAgICAgOiBhbmFseXplZC5zZWNcbiAgICAsIGdhbWV0eXBlIDogYW5hbHl6ZWQuZ2FtZXR5cGVcbiAgICAsIGdhbWVubyAgIDogYW5hbHl6ZWQuZ2FtZW5vXG4gICAgLCBoYW5kaWQgICA6IGFuYWx5emVkLmhhbmRpZFxuICB9XG5cbiAgaW5mby5hbnlBY3Rpdml0eSA9ICcnXG4gIGluZm8ucGxheWVyQWN0aXZpdHkgPSAnJ1xuXG4gIGlmIChhbmFseXplZC5hbnlJbnZlc3RlZCkgaW5mby5hbnlBY3Rpdml0eSArPSAnIGFueS1pbnZlc3RlZCAnXG4gIGlmIChhbmFseXplZC5hbnlTYXdGbG9wKSBpbmZvLmFueUFjdGl2aXR5ICs9ICcgYW55LXNhd0Zsb3AgJ1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXJzW2ldXG4gICAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZVBsYXllck5hbWUocC5uYW1lKVxuICAgIGluZm8ucGxheWVyQWN0aXZpdHkgKz0gJyAnICsgbmFtZVxuICAgIGlmIChwLmludmVzdGVkKSBpbmZvLnBsYXllckFjdGl2aXR5ICs9ICAnICcgKyBuYW1lICsgJy1pbnZlc3RlZCdcbiAgICBpZiAocC5zYXdGbG9wKSBpbmZvLnBsYXllckFjdGl2aXR5ICs9ICAnICcgKyBuYW1lICsgJy1zYXdGbG9wJ1xuICB9XG4gIHJldHVybiBpbmZvXG59XG5cbmV4cG9ydHMuY3NzICAgICAgID0gY3NzKClcbmV4cG9ydHMuZmlsdGVyQ3NzID0gZmlsdGVyQ3NzXG5leHBvcnRzLmhlYWQgICAgICA9IGhlYWRcblxuZXhwb3J0cy5pbmplY3RTdHlsZSA9IGluamVjdFN0eWxlXG5cbmV4cG9ydHMuZmlsdGVySGFuZHMgPSBmdW5jdGlvbiBmaWx0ZXJIYW5kcyAob3B0cykge1xuICAvLyBjcmVhdGUgY2xhc3MgZGVmaW5pdGlvbnMgdG8gdHJpZ2dlciB3aGljaCBwbGF5ZXIgcm93cyBhbmQgd2hpY2ggaGFuZHMgYXJlIHNob3duXG4gIGxldCBoYW5kRmlsdGVyID0gJydcbiAgbGV0IHBsYXllcnNGaWx0ZXIgPSAnJ1xuICBpZiAob3B0cy5wbGF5ZXJzKSB7XG4gICAgaGFuZEZpbHRlciArPSAnLmFueS0nICsgb3B0cy5wbGF5ZXJzLmZpbHRlclxuICAgIHBsYXllcnNGaWx0ZXIgPSAnLicgKyBvcHRzLnBsYXllcnMuZmlsdGVyXG4gIH1cbiAgaWYgKG9wdHMuaGFuZCkge1xuICAgIGhhbmRGaWx0ZXIgKz0gJy4nICsgb3B0cy5oYW5kLndobyArICctJyArIG9wdHMuaGFuZC5maWx0ZXJcbiAgfVxuICBjb25zdCBmaWx0ZXIgPSB7IGhhbmQ6IGhhbmRGaWx0ZXIsIHBsYXllcnM6IHBsYXllcnNGaWx0ZXIgfVxuICBpbmplY3RTdHlsZShmaWx0ZXJDc3MoZmlsdGVyKSwgZG9jdW1lbnQsICdoYW5kLWZpbHRlcicpXG59XG5cbmV4cG9ydHMuc2VsZWN0UGxheWVyID0gZnVuY3Rpb24gc2VsZWN0UGxheWVyIChzZWxlY3RlZCwgbmFtZSkge1xuICBpbmplY3RTdHlsZShzZWxlY3RQbGF5ZXJDc3MoeyBzZWxlY3RlZDogc2VsZWN0ZWQsIG5hbWU6IG5hbWUgfSksIGRvY3VtZW50LCAncGxheWVyLXNlbGVjdCcpXG59XG5cbmNvbnN0IHByZXBhcmVSZW5kZXIgPSBleHBvcnRzLnByZXBhcmVSZW5kZXIgPSBmdW5jdGlvbiBwcmVwYXJlUmVuZGVyIChhbmFseXplZCkge1xuICBjb25zdCBpbmZvID0ge1xuICAgICAgaW5mbyAgICAgICAgICAgIDogcmVuZGVySW5mbyhhbmFseXplZC5pbmZvLCBhbmFseXplZC5wbGF5ZXJzKVxuICAgICwgdGFibGUgICAgICAgICAgIDogYW5hbHl6ZWQudGFibGVcbiAgICAsIGJvYXJkICAgICAgICAgICA6IGFuYWx5emVkLmJvYXJkXG4gICAgLCByZW5kZXJlZEJvYXJkICAgOiByZW5kZXJDYXJkcyhhbmFseXplZC5ib2FyZClcbiAgICAsIHBsYXllcnMgICAgICAgICA6IGFuYWx5emVkLnBsYXllcnNcbiAgICAsIHJlbmRlcmVkUGxheWVycyA6IGFuYWx5emVkLnBsYXllcnMubWFwKHJlbmRlclBsYXllcilcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgICBpbmZvOiBpbmZvXG4gICAgLCBwbGF5ZXJzOiBhbmFseXplZC5wbGF5ZXJzLm1hcChuYW1lUGxheWVyKVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckNoaXBzKGFuYWx5emVkKSB7XG4gIGNvbnN0IGhlcm8gPSBhbmFseXplZC5oZXJvXG4gIGxldCBwbGF5ZXJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbmFseXplZC5wbGF5ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGFuYWx5emVkLnBsYXllcnNbaV1cbiAgICBpZiAocC5uYW1lID09PSBoZXJvKSB7XG4gICAgICBwbGF5ZXIgPSBwXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGlmICghcGxheWVyIHx8IHBsYXllci5jaGlwcyA9PT0gcGxheWVyLmNoaXBzQWZ0ZXIpIHJldHVybiAnJ1xuXG4gIHJldHVybiAoXG4gICAgJzxkaXY+PHNwYW4+JCcgK1xuICAgICAgcGxheWVyLmNoaXBzICsgJyDinqEgJCcgKyBwbGF5ZXIuY2hpcHNBZnRlci50b0ZpeGVkKDIpICtcbiAgICAgICcgKCQnICsgKHBsYXllci5jaGlwc0FmdGVyIC0gcGxheWVyLmNoaXBzKS50b0ZpeGVkKDIpICsgJyknICtcbiAgICAnPC9zcGFuPjwvZGl2PidcbiAgKVxufVxuXG5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uIHJlbmRlciAoYW5hbHl6ZWQsIHNob3dDaGlwcykge1xuICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVSZW5kZXIoYW5hbHl6ZWQpXG4gIGxldCBodG1sID0gaG9sZGVtKHByZXBhcmVkLmluZm8pXG4gIGlmIChzaG93Q2hpcHMpIGh0bWwgKz0gcmVuZGVyQ2hpcHMoYW5hbHl6ZWQpXG4gIHJldHVybiB7XG4gICAgICBodG1sOiBodG1sXG4gICAgLCBwbGF5ZXJzOiBwcmVwYXJlZC5wbGF5ZXJzXG4gIH1cbn1cblxuZXhwb3J0cy5ub3JtYWxpemVQbGF5ZXJOYW1lID0gbm9ybWFsaXplUGxheWVyTmFtZVxuXG5leHBvcnRzLnBhZ2VpZnkgPSBmdW5jdGlvbiBwYWdlaWZ5IChyZW5kZXJlZEhhbmRzKSB7XG4gIGNvbnN0IGh0bWwgPVxuICAgICAgaGVhZFxuICAgICsgJzxib2R5PidcbiAgICAgICsgcmVuZGVyZWRIYW5kc1xuICAgICsgJzwvYm9keT4nXG4gIHJldHVybiBodG1sXG59XG5cbmV4cG9ydHMuc29ydEJ5RGF0ZVRpbWUgPSBzb3J0LmJ5RGF0ZVRpbWVcbmV4cG9ydHMuc29ydEJ5RGF0ZVRpbWVEZXNjZW5kaW5nID0gc29ydC5ieURhdGVUaW1lRGVzY2VuZGluZ1xuXG5leHBvcnRzLnJlbmRlckZpbHRlciA9IGZ1bmN0aW9uIHJlbmRlckZpbHRlciAocGxheWVycywgaGVybykge1xuICBmdW5jdGlvbiBwbGF5ZXJJbmZvIChwKSB7XG4gICAgcmV0dXJuIHsgbmFtZTogcCwgaXNIZXJvOiBwID09PSBoZXJvIH1cbiAgfVxuICByZXR1cm4gdWlGaWx0ZXIoeyBwbGF5ZXJzOiBwbGF5ZXJzLm1hcChwbGF5ZXJJbmZvKSB9KVxufVxuXG4vLyBUZXN0XG4vKiBlc2xpbnQtZGlzYWJsZSBuby11bnVzZWQtdmFycyAqL1xuZnVuY3Rpb24gaW5zcCAob2JqLCBkZXB0aCkge1xuICBjb25zb2xlLmVycm9yKHJlcXVpcmUoJ3V0aWwnKS5pbnNwZWN0KG9iaiwgZmFsc2UsIGRlcHRoIHx8IDUsIGZhbHNlKSlcbn1cbmZ1bmN0aW9uIGluc3BlY3QgKG9iaiwgZGVwdGgpIHtcbiAgY29uc29sZS5lcnJvcihyZXF1aXJlKCd1dGlsJykuaW5zcGVjdChvYmosIGZhbHNlLCBkZXB0aCB8fCA1LCB0cnVlKSlcbn1cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG5cbmNvbnN0IGFjdGlvbm9uYWxsID0gZXhwb3J0cy5yZW5kZXIocmVxdWlyZSgnLi90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uJykpXG5jb25zdCBhbGxpbiA9IGV4cG9ydHMucmVuZGVyKHJlcXVpcmUoJy4vdGVzdC9maXh0dXJlcy9ob2xkZW0vYWxsaW4tcHJlZmxvcC5qc29uJykpXG5jb25zdCBodG1sID0gZXhwb3J0cy5wYWdlaWZ5KGFjdGlvbm9uYWxsICsgYWxsaW4pXG4vLyBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihfX2Rpcm5hbWUsICd0ZXN0Lmh0bWwnKSwgaHRtbCwgJ3V0ZjgnKVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBoYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpXG5jb25zdCBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJylcbmhlbHBlcnMoaGFuZGxlYmFycylcblxuZXhwb3J0cy5oZWFkICAgICAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvaGVhZC5oYnMnKVxuZXhwb3J0cy5jc3MgICAgICAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvc3R5bGUuaGJzJylcbmV4cG9ydHMuZmlsdGVyQ3NzICAgICAgID0gcmVxdWlyZSgnLi4vdGVtcGxhdGVzL3N0eWxlLWZpbHRlci5oYnMnKVxuZXhwb3J0cy5zZWxlY3RQbGF5ZXJDc3MgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvc3R5bGUtc2VsZWN0LXBsYXllci5oYnMnKVxuZXhwb3J0cy51aUZpbHRlciAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvdWktZmlsdGVyLmhicycpXG5leHBvcnRzLmhvbGRlbSAgICAgICAgICA9IHJlcXVpcmUoJy4uL3RlbXBsYXRlcy9ob2xkZW0uaGJzJylcbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiB0d29EaWdpdHMgKG4pIHtcbiAgcmV0dXJuICgnMCcgKyBuKS5zbGljZSgtMilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBoZWxwZXJzIChoYW5kbGViYXJzKSB7XG4gIGhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2lmdmFsdWUnLCBmdW5jdGlvbiAoY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5oYXNoLnZhbHVlID09PSBjb25kaXRpb25hbCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuZm4odGhpcylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKVxuICAgIH1cbiAgfSlcbiAgaGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcigndHdvZGlnaXRzJywgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdHdvRGlnaXRzKG9wdGlvbnMuZm4odGhpcykpXG4gIH0pXG59XG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gaW5qZWN0U3R5bGVUYWcgKGRvY3VtZW50LCBpZCkge1xuICBsZXQgc3R5bGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZClcblxuICBpZiAoIXN0eWxlKSB7XG4gICAgY29uc3QgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF1cbiAgICBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJylcbiAgICBpZiAoaWQgIT0gbnVsbCkgc3R5bGUuaWQgPSBpZFxuICAgIGhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpXG4gIH1cblxuICByZXR1cm4gc3R5bGVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmplY3RTdHlsZSAoY3NzLCBkb2N1bWVudCwgaWQpIHtcbiAgY29uc3Qgc3R5bGUgPSBpbmplY3RTdHlsZVRhZyhkb2N1bWVudCwgaWQpXG4gIGlmIChzdHlsZS5zdHlsZVNoZWV0KSB7XG4gICAgc3R5bGUuc3R5bGVTaGVldC5jc3NUZXh0ID0gY3NzXG4gIH0gZWxzZSB7XG4gICAgc3R5bGUuaW5uZXJIVE1MID0gY3NzXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBieURhdGVUaW1lIChoMSwgaDIpIHtcbiAgY29uc3QgaTEgPSBoMS5pbmZvXG4gIGNvbnN0IGkyID0gaDIuaW5mb1xuICBpZiAoaTEueWVhciA8IGkyLnllYXIpICAgcmV0dXJuIC0xXG4gIGlmIChpMS55ZWFyID4gaTIueWVhcikgICByZXR1cm4gIDFcbiAgaWYgKGkxLm1vbnRoIDwgaTIubW9udGgpIHJldHVybiAtMVxuICBpZiAoaTEubW9udGggPiBpMi5tb250aCkgcmV0dXJuICAxXG4gIGlmIChpMS5kYXkgPCBpMi5kYXkpICAgICByZXR1cm4gLTFcbiAgaWYgKGkxLmRheSA+IGkyLmRheSkgICAgIHJldHVybiAgMVxuICBpZiAoaTEuaG91ciA8IGkyLmhvdXIpICAgcmV0dXJuIC0xXG4gIGlmIChpMS5ob3VyID4gaTIuaG91cikgICByZXR1cm4gIDFcbiAgaWYgKGkxLm1pbiA8IGkyLm1pbikgICAgIHJldHVybiAtMVxuICBpZiAoaTEubWluID4gaTIubWluKSAgICAgcmV0dXJuICAxXG4gIGlmIChpMS5zZWMgPCBpMi5zZWMpICAgICByZXR1cm4gLTFcbiAgaWYgKGkxLnNlYyA+IGkyLnNlYykgICAgIHJldHVybiAgMVxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBieURhdGVUaW1lRGVzY2VuZGluZyAoaDEsIGgyKSB7XG4gIHJldHVybiAoLTEpICogYnlEYXRlVGltZShoMSwgaDIpXG59XG5cbmV4cG9ydHMuYnlEYXRlVGltZSA9IGZ1bmN0aW9uIHNvcnRCeURhdGVUaW1lIChhbmFseXplZCkge1xuICByZXR1cm4gYW5hbHl6ZWQuc29ydChieURhdGVUaW1lKVxufVxuXG5leHBvcnRzLmJ5RGF0ZVRpbWVEZXNjZW5kaW5nID0gZnVuY3Rpb24gc29ydEJ5RGF0ZVRpbWVEZXNjZW5kaW5nIChhbmFseXplZCkge1xuICByZXR1cm4gYW5hbHl6ZWQuc29ydChieURhdGVUaW1lRGVzY2VuZGluZylcbn1cbiIsIiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHJlc29sdmVzIC4gYW5kIC4uIGVsZW1lbnRzIGluIGEgcGF0aCBhcnJheSB3aXRoIGRpcmVjdG9yeSBuYW1lcyB0aGVyZVxuLy8gbXVzdCBiZSBubyBzbGFzaGVzLCBlbXB0eSBlbGVtZW50cywgb3IgZGV2aWNlIG5hbWVzIChjOlxcKSBpbiB0aGUgYXJyYXlcbi8vIChzbyBhbHNvIG5vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgLSBpdCBkb2VzIG5vdCBkaXN0aW5ndWlzaFxuLy8gcmVsYXRpdmUgYW5kIGFic29sdXRlIHBhdGhzKVxuZnVuY3Rpb24gbm9ybWFsaXplQXJyYXkocGFydHMsIGFsbG93QWJvdmVSb290KSB7XG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBwYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIHZhciBsYXN0ID0gcGFydHNbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKGFsbG93QWJvdmVSb290KSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBwYXJ0cy51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYXJ0cztcbn1cblxuLy8gU3BsaXQgYSBmaWxlbmFtZSBpbnRvIFtyb290LCBkaXIsIGJhc2VuYW1lLCBleHRdLCB1bml4IHZlcnNpb25cbi8vICdyb290JyBpcyBqdXN0IGEgc2xhc2gsIG9yIG5vdGhpbmcuXG52YXIgc3BsaXRQYXRoUmUgPVxuICAgIC9eKFxcLz98KShbXFxzXFxTXSo/KSgoPzpcXC57MSwyfXxbXlxcL10rP3wpKFxcLlteLlxcL10qfCkpKD86W1xcL10qKSQvO1xudmFyIHNwbGl0UGF0aCA9IGZ1bmN0aW9uKGZpbGVuYW1lKSB7XG4gIHJldHVybiBzcGxpdFBhdGhSZS5leGVjKGZpbGVuYW1lKS5zbGljZSgxKTtcbn07XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIHJlc3VsdCA9IHNwbGl0UGF0aChwYXRoKSxcbiAgICAgIHJvb3QgPSByZXN1bHRbMF0sXG4gICAgICBkaXIgPSByZXN1bHRbMV07XG5cbiAgaWYgKCFyb290ICYmICFkaXIpIHtcbiAgICAvLyBObyBkaXJuYW1lIHdoYXRzb2V2ZXJcbiAgICByZXR1cm4gJy4nO1xuICB9XG5cbiAgaWYgKGRpcikge1xuICAgIC8vIEl0IGhhcyBhIGRpcm5hbWUsIHN0cmlwIHRyYWlsaW5nIHNsYXNoXG4gICAgZGlyID0gZGlyLnN1YnN0cigwLCBkaXIubGVuZ3RoIC0gMSk7XG4gIH1cblxuICByZXR1cm4gcm9vdCArIGRpcjtcbn07XG5cblxuZXhwb3J0cy5iYXNlbmFtZSA9IGZ1bmN0aW9uKHBhdGgsIGV4dCkge1xuICB2YXIgZiA9IHNwbGl0UGF0aChwYXRoKVsyXTtcbiAgLy8gVE9ETzogbWFrZSB0aGlzIGNvbXBhcmlzb24gY2FzZS1pbnNlbnNpdGl2ZSBvbiB3aW5kb3dzP1xuICBpZiAoZXh0ICYmIGYuc3Vic3RyKC0xICogZXh0Lmxlbmd0aCkgPT09IGV4dCkge1xuICAgIGYgPSBmLnN1YnN0cigwLCBmLmxlbmd0aCAtIGV4dC5sZW5ndGgpO1xuICB9XG4gIHJldHVybiBmO1xufTtcblxuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBzcGxpdFBhdGgocGF0aClbM107XG59O1xuXG5mdW5jdGlvbiBmaWx0ZXIgKHhzLCBmKSB7XG4gICAgaWYgKHhzLmZpbHRlcikgcmV0dXJuIHhzLmZpbHRlcihmKTtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZih4c1tpXSwgaSwgeHMpKSByZXMucHVzaCh4c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbi8vIFN0cmluZy5wcm90b3R5cGUuc3Vic3RyIC0gbmVnYXRpdmUgaW5kZXggZG9uJ3Qgd29yayBpbiBJRThcbnZhciBzdWJzdHIgPSAnYWInLnN1YnN0cigtMSkgPT09ICdiJ1xuICAgID8gZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikgeyByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKSB9XG4gICAgOiBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7XG4gICAgICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gc3RyLmxlbmd0aCArIHN0YXJ0O1xuICAgICAgICByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKTtcbiAgICB9XG47XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iLCJpbXBvcnQgKiBhcyBiYXNlIGZyb20gJy4vaGFuZGxlYmFycy9iYXNlJztcblxuLy8gRWFjaCBvZiB0aGVzZSBhdWdtZW50IHRoZSBIYW5kbGViYXJzIG9iamVjdC4gTm8gbmVlZCB0byBzZXR1cCBoZXJlLlxuLy8gKFRoaXMgaXMgZG9uZSB0byBlYXNpbHkgc2hhcmUgY29kZSBiZXR3ZWVuIGNvbW1vbmpzIGFuZCBicm93c2UgZW52cylcbmltcG9ydCBTYWZlU3RyaW5nIGZyb20gJy4vaGFuZGxlYmFycy9zYWZlLXN0cmluZyc7XG5pbXBvcnQgRXhjZXB0aW9uIGZyb20gJy4vaGFuZGxlYmFycy9leGNlcHRpb24nO1xuaW1wb3J0ICogYXMgVXRpbHMgZnJvbSAnLi9oYW5kbGViYXJzL3V0aWxzJztcbmltcG9ydCAqIGFzIHJ1bnRpbWUgZnJvbSAnLi9oYW5kbGViYXJzL3J1bnRpbWUnO1xuXG5pbXBvcnQgbm9Db25mbGljdCBmcm9tICcuL2hhbmRsZWJhcnMvbm8tY29uZmxpY3QnO1xuXG4vLyBGb3IgY29tcGF0aWJpbGl0eSBhbmQgdXNhZ2Ugb3V0c2lkZSBvZiBtb2R1bGUgc3lzdGVtcywgbWFrZSB0aGUgSGFuZGxlYmFycyBvYmplY3QgYSBuYW1lc3BhY2VcbmZ1bmN0aW9uIGNyZWF0ZSgpIHtcbiAgbGV0IGhiID0gbmV3IGJhc2UuSGFuZGxlYmFyc0Vudmlyb25tZW50KCk7XG5cbiAgVXRpbHMuZXh0ZW5kKGhiLCBiYXNlKTtcbiAgaGIuU2FmZVN0cmluZyA9IFNhZmVTdHJpbmc7XG4gIGhiLkV4Y2VwdGlvbiA9IEV4Y2VwdGlvbjtcbiAgaGIuVXRpbHMgPSBVdGlscztcbiAgaGIuZXNjYXBlRXhwcmVzc2lvbiA9IFV0aWxzLmVzY2FwZUV4cHJlc3Npb247XG5cbiAgaGIuVk0gPSBydW50aW1lO1xuICBoYi50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHNwZWMpIHtcbiAgICByZXR1cm4gcnVudGltZS50ZW1wbGF0ZShzcGVjLCBoYik7XG4gIH07XG5cbiAgcmV0dXJuIGhiO1xufVxuXG5sZXQgaW5zdCA9IGNyZWF0ZSgpO1xuaW5zdC5jcmVhdGUgPSBjcmVhdGU7XG5cbm5vQ29uZmxpY3QoaW5zdCk7XG5cbmluc3RbJ2RlZmF1bHQnXSA9IGluc3Q7XG5cbmV4cG9ydCBkZWZhdWx0IGluc3Q7XG4iLCJpbXBvcnQge2NyZWF0ZUZyYW1lLCBleHRlbmQsIHRvU3RyaW5nfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBFeGNlcHRpb24gZnJvbSAnLi9leGNlcHRpb24nO1xuaW1wb3J0IHtyZWdpc3RlckRlZmF1bHRIZWxwZXJzfSBmcm9tICcuL2hlbHBlcnMnO1xuaW1wb3J0IHtyZWdpc3RlckRlZmF1bHREZWNvcmF0b3JzfSBmcm9tICcuL2RlY29yYXRvcnMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBWRVJTSU9OID0gJzQuMC41JztcbmV4cG9ydCBjb25zdCBDT01QSUxFUl9SRVZJU0lPTiA9IDc7XG5cbmV4cG9ydCBjb25zdCBSRVZJU0lPTl9DSEFOR0VTID0ge1xuICAxOiAnPD0gMS4wLnJjLjInLCAvLyAxLjAucmMuMiBpcyBhY3R1YWxseSByZXYyIGJ1dCBkb2Vzbid0IHJlcG9ydCBpdFxuICAyOiAnPT0gMS4wLjAtcmMuMycsXG4gIDM6ICc9PSAxLjAuMC1yYy40JyxcbiAgNDogJz09IDEueC54JyxcbiAgNTogJz09IDIuMC4wLWFscGhhLngnLFxuICA2OiAnPj0gMi4wLjAtYmV0YS4xJyxcbiAgNzogJz49IDQuMC4wJ1xufTtcblxuY29uc3Qgb2JqZWN0VHlwZSA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG5leHBvcnQgZnVuY3Rpb24gSGFuZGxlYmFyc0Vudmlyb25tZW50KGhlbHBlcnMsIHBhcnRpYWxzLCBkZWNvcmF0b3JzKSB7XG4gIHRoaXMuaGVscGVycyA9IGhlbHBlcnMgfHwge307XG4gIHRoaXMucGFydGlhbHMgPSBwYXJ0aWFscyB8fCB7fTtcbiAgdGhpcy5kZWNvcmF0b3JzID0gZGVjb3JhdG9ycyB8fCB7fTtcblxuICByZWdpc3RlckRlZmF1bHRIZWxwZXJzKHRoaXMpO1xuICByZWdpc3RlckRlZmF1bHREZWNvcmF0b3JzKHRoaXMpO1xufVxuXG5IYW5kbGViYXJzRW52aXJvbm1lbnQucHJvdG90eXBlID0ge1xuICBjb25zdHJ1Y3RvcjogSGFuZGxlYmFyc0Vudmlyb25tZW50LFxuXG4gIGxvZ2dlcjogbG9nZ2VyLFxuICBsb2c6IGxvZ2dlci5sb2csXG5cbiAgcmVnaXN0ZXJIZWxwZXI6IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICAgIGlmIChmbikgeyB0aHJvdyBuZXcgRXhjZXB0aW9uKCdBcmcgbm90IHN1cHBvcnRlZCB3aXRoIG11bHRpcGxlIGhlbHBlcnMnKTsgfVxuICAgICAgZXh0ZW5kKHRoaXMuaGVscGVycywgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaGVscGVyc1tuYW1lXSA9IGZuO1xuICAgIH1cbiAgfSxcbiAgdW5yZWdpc3RlckhlbHBlcjogZnVuY3Rpb24obmFtZSkge1xuICAgIGRlbGV0ZSB0aGlzLmhlbHBlcnNbbmFtZV07XG4gIH0sXG5cbiAgcmVnaXN0ZXJQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICAgIGV4dGVuZCh0aGlzLnBhcnRpYWxzLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHR5cGVvZiBwYXJ0aWFsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKGBBdHRlbXB0aW5nIHRvIHJlZ2lzdGVyIGEgcGFydGlhbCBjYWxsZWQgXCIke25hbWV9XCIgYXMgdW5kZWZpbmVkYCk7XG4gICAgICB9XG4gICAgICB0aGlzLnBhcnRpYWxzW25hbWVdID0gcGFydGlhbDtcbiAgICB9XG4gIH0sXG4gIHVucmVnaXN0ZXJQYXJ0aWFsOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgZGVsZXRlIHRoaXMucGFydGlhbHNbbmFtZV07XG4gIH0sXG5cbiAgcmVnaXN0ZXJEZWNvcmF0b3I6IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICAgIGlmIChmbikgeyB0aHJvdyBuZXcgRXhjZXB0aW9uKCdBcmcgbm90IHN1cHBvcnRlZCB3aXRoIG11bHRpcGxlIGRlY29yYXRvcnMnKTsgfVxuICAgICAgZXh0ZW5kKHRoaXMuZGVjb3JhdG9ycywgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZGVjb3JhdG9yc1tuYW1lXSA9IGZuO1xuICAgIH1cbiAgfSxcbiAgdW5yZWdpc3RlckRlY29yYXRvcjogZnVuY3Rpb24obmFtZSkge1xuICAgIGRlbGV0ZSB0aGlzLmRlY29yYXRvcnNbbmFtZV07XG4gIH1cbn07XG5cbmV4cG9ydCBsZXQgbG9nID0gbG9nZ2VyLmxvZztcblxuZXhwb3J0IHtjcmVhdGVGcmFtZSwgbG9nZ2VyfTtcbiIsImltcG9ydCByZWdpc3RlcklubGluZSBmcm9tICcuL2RlY29yYXRvcnMvaW5saW5lJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRGVmYXVsdERlY29yYXRvcnMoaW5zdGFuY2UpIHtcbiAgcmVnaXN0ZXJJbmxpbmUoaW5zdGFuY2UpO1xufVxuXG4iLCJpbXBvcnQge2V4dGVuZH0gZnJvbSAnLi4vdXRpbHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckRlY29yYXRvcignaW5saW5lJywgZnVuY3Rpb24oZm4sIHByb3BzLCBjb250YWluZXIsIG9wdGlvbnMpIHtcbiAgICBsZXQgcmV0ID0gZm47XG4gICAgaWYgKCFwcm9wcy5wYXJ0aWFscykge1xuICAgICAgcHJvcHMucGFydGlhbHMgPSB7fTtcbiAgICAgIHJldCA9IGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IHBhcnRpYWxzIHN0YWNrIGZyYW1lIHByaW9yIHRvIGV4ZWMuXG4gICAgICAgIGxldCBvcmlnaW5hbCA9IGNvbnRhaW5lci5wYXJ0aWFscztcbiAgICAgICAgY29udGFpbmVyLnBhcnRpYWxzID0gZXh0ZW5kKHt9LCBvcmlnaW5hbCwgcHJvcHMucGFydGlhbHMpO1xuICAgICAgICBsZXQgcmV0ID0gZm4oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgICAgIGNvbnRhaW5lci5wYXJ0aWFscyA9IG9yaWdpbmFsO1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBwcm9wcy5wYXJ0aWFsc1tvcHRpb25zLmFyZ3NbMF1dID0gb3B0aW9ucy5mbjtcblxuICAgIHJldHVybiByZXQ7XG4gIH0pO1xufVxuIiwiXG5jb25zdCBlcnJvclByb3BzID0gWydkZXNjcmlwdGlvbicsICdmaWxlTmFtZScsICdsaW5lTnVtYmVyJywgJ21lc3NhZ2UnLCAnbmFtZScsICdudW1iZXInLCAnc3RhY2snXTtcblxuZnVuY3Rpb24gRXhjZXB0aW9uKG1lc3NhZ2UsIG5vZGUpIHtcbiAgbGV0IGxvYyA9IG5vZGUgJiYgbm9kZS5sb2MsXG4gICAgICBsaW5lLFxuICAgICAgY29sdW1uO1xuICBpZiAobG9jKSB7XG4gICAgbGluZSA9IGxvYy5zdGFydC5saW5lO1xuICAgIGNvbHVtbiA9IGxvYy5zdGFydC5jb2x1bW47XG5cbiAgICBtZXNzYWdlICs9ICcgLSAnICsgbGluZSArICc6JyArIGNvbHVtbjtcbiAgfVxuXG4gIGxldCB0bXAgPSBFcnJvci5wcm90b3R5cGUuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBtZXNzYWdlKTtcblxuICAvLyBVbmZvcnR1bmF0ZWx5IGVycm9ycyBhcmUgbm90IGVudW1lcmFibGUgaW4gQ2hyb21lIChhdCBsZWFzdCksIHNvIGBmb3IgcHJvcCBpbiB0bXBgIGRvZXNuJ3Qgd29yay5cbiAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgZXJyb3JQcm9wcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgdGhpc1tlcnJvclByb3BzW2lkeF1dID0gdG1wW2Vycm9yUHJvcHNbaWR4XV07XG4gIH1cblxuICAvKiBpc3RhbmJ1bCBpZ25vcmUgZWxzZSAqL1xuICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCBFeGNlcHRpb24pO1xuICB9XG5cbiAgaWYgKGxvYykge1xuICAgIHRoaXMubGluZU51bWJlciA9IGxpbmU7XG4gICAgdGhpcy5jb2x1bW4gPSBjb2x1bW47XG4gIH1cbn1cblxuRXhjZXB0aW9uLnByb3RvdHlwZSA9IG5ldyBFcnJvcigpO1xuXG5leHBvcnQgZGVmYXVsdCBFeGNlcHRpb247XG4iLCJpbXBvcnQgcmVnaXN0ZXJCbG9ja0hlbHBlck1pc3NpbmcgZnJvbSAnLi9oZWxwZXJzL2Jsb2NrLWhlbHBlci1taXNzaW5nJztcbmltcG9ydCByZWdpc3RlckVhY2ggZnJvbSAnLi9oZWxwZXJzL2VhY2gnO1xuaW1wb3J0IHJlZ2lzdGVySGVscGVyTWlzc2luZyBmcm9tICcuL2hlbHBlcnMvaGVscGVyLW1pc3NpbmcnO1xuaW1wb3J0IHJlZ2lzdGVySWYgZnJvbSAnLi9oZWxwZXJzL2lmJztcbmltcG9ydCByZWdpc3RlckxvZyBmcm9tICcuL2hlbHBlcnMvbG9nJztcbmltcG9ydCByZWdpc3Rlckxvb2t1cCBmcm9tICcuL2hlbHBlcnMvbG9va3VwJztcbmltcG9ydCByZWdpc3RlcldpdGggZnJvbSAnLi9oZWxwZXJzL3dpdGgnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEZWZhdWx0SGVscGVycyhpbnN0YW5jZSkge1xuICByZWdpc3RlckJsb2NrSGVscGVyTWlzc2luZyhpbnN0YW5jZSk7XG4gIHJlZ2lzdGVyRWFjaChpbnN0YW5jZSk7XG4gIHJlZ2lzdGVySGVscGVyTWlzc2luZyhpbnN0YW5jZSk7XG4gIHJlZ2lzdGVySWYoaW5zdGFuY2UpO1xuICByZWdpc3RlckxvZyhpbnN0YW5jZSk7XG4gIHJlZ2lzdGVyTG9va3VwKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJXaXRoKGluc3RhbmNlKTtcbn1cbiIsImltcG9ydCB7YXBwZW5kQ29udGV4dFBhdGgsIGNyZWF0ZUZyYW1lLCBpc0FycmF5fSBmcm9tICcuLi91dGlscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdibG9ja0hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgbGV0IGludmVyc2UgPSBvcHRpb25zLmludmVyc2UsXG4gICAgICAgIGZuID0gb3B0aW9ucy5mbjtcblxuICAgIGlmIChjb250ZXh0ID09PSB0cnVlKSB7XG4gICAgICByZXR1cm4gZm4odGhpcyk7XG4gICAgfSBlbHNlIGlmIChjb250ZXh0ID09PSBmYWxzZSB8fCBjb250ZXh0ID09IG51bGwpIHtcbiAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShjb250ZXh0KSkge1xuICAgICAgaWYgKGNvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAob3B0aW9ucy5pZHMpIHtcbiAgICAgICAgICBvcHRpb25zLmlkcyA9IFtvcHRpb25zLm5hbWVdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGluc3RhbmNlLmhlbHBlcnMuZWFjaChjb250ZXh0LCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuaWRzKSB7XG4gICAgICAgIGxldCBkYXRhID0gY3JlYXRlRnJhbWUob3B0aW9ucy5kYXRhKTtcbiAgICAgICAgZGF0YS5jb250ZXh0UGF0aCA9IGFwcGVuZENvbnRleHRQYXRoKG9wdGlvbnMuZGF0YS5jb250ZXh0UGF0aCwgb3B0aW9ucy5uYW1lKTtcbiAgICAgICAgb3B0aW9ucyA9IHtkYXRhOiBkYXRhfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZuKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH1cbiAgfSk7XG59XG4iLCJpbXBvcnQge2FwcGVuZENvbnRleHRQYXRoLCBibG9ja1BhcmFtcywgY3JlYXRlRnJhbWUsIGlzQXJyYXksIGlzRnVuY3Rpb259IGZyb20gJy4uL3V0aWxzJztcbmltcG9ydCBFeGNlcHRpb24gZnJvbSAnLi4vZXhjZXB0aW9uJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2VhY2gnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdNdXN0IHBhc3MgaXRlcmF0b3IgdG8gI2VhY2gnKTtcbiAgICB9XG5cbiAgICBsZXQgZm4gPSBvcHRpb25zLmZuLFxuICAgICAgICBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlLFxuICAgICAgICBpID0gMCxcbiAgICAgICAgcmV0ID0gJycsXG4gICAgICAgIGRhdGEsXG4gICAgICAgIGNvbnRleHRQYXRoO1xuXG4gICAgaWYgKG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLmlkcykge1xuICAgICAgY29udGV4dFBhdGggPSBhcHBlbmRDb250ZXh0UGF0aChvcHRpb25zLmRhdGEuY29udGV4dFBhdGgsIG9wdGlvbnMuaWRzWzBdKSArICcuJztcbiAgICB9XG5cbiAgICBpZiAoaXNGdW5jdGlvbihjb250ZXh0KSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgICBpZiAob3B0aW9ucy5kYXRhKSB7XG4gICAgICBkYXRhID0gY3JlYXRlRnJhbWUob3B0aW9ucy5kYXRhKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBleGVjSXRlcmF0aW9uKGZpZWxkLCBpbmRleCwgbGFzdCkge1xuICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgZGF0YS5rZXkgPSBmaWVsZDtcbiAgICAgICAgZGF0YS5pbmRleCA9IGluZGV4O1xuICAgICAgICBkYXRhLmZpcnN0ID0gaW5kZXggPT09IDA7XG4gICAgICAgIGRhdGEubGFzdCA9ICEhbGFzdDtcblxuICAgICAgICBpZiAoY29udGV4dFBhdGgpIHtcbiAgICAgICAgICBkYXRhLmNvbnRleHRQYXRoID0gY29udGV4dFBhdGggKyBmaWVsZDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXQgPSByZXQgKyBmbihjb250ZXh0W2ZpZWxkXSwge1xuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICBibG9ja1BhcmFtczogYmxvY2tQYXJhbXMoW2NvbnRleHRbZmllbGRdLCBmaWVsZF0sIFtjb250ZXh0UGF0aCArIGZpZWxkLCBudWxsXSlcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChjb250ZXh0ICYmIHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKGlzQXJyYXkoY29udGV4dCkpIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGNvbnRleHQubGVuZ3RoOyBpIDwgajsgaSsrKSB7XG4gICAgICAgICAgaWYgKGkgaW4gY29udGV4dCkge1xuICAgICAgICAgICAgZXhlY0l0ZXJhdGlvbihpLCBpLCBpID09PSBjb250ZXh0Lmxlbmd0aCAtIDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHByaW9yS2V5O1xuXG4gICAgICAgIGZvciAobGV0IGtleSBpbiBjb250ZXh0KSB7XG4gICAgICAgICAgaWYgKGNvbnRleHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgLy8gV2UncmUgcnVubmluZyB0aGUgaXRlcmF0aW9ucyBvbmUgc3RlcCBvdXQgb2Ygc3luYyBzbyB3ZSBjYW4gZGV0ZWN0XG4gICAgICAgICAgICAvLyB0aGUgbGFzdCBpdGVyYXRpb24gd2l0aG91dCBoYXZlIHRvIHNjYW4gdGhlIG9iamVjdCB0d2ljZSBhbmQgY3JlYXRlXG4gICAgICAgICAgICAvLyBhbiBpdGVybWVkaWF0ZSBrZXlzIGFycmF5LlxuICAgICAgICAgICAgaWYgKHByaW9yS2V5ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgZXhlY0l0ZXJhdGlvbihwcmlvcktleSwgaSAtIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJpb3JLZXkgPSBrZXk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChwcmlvcktleSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgZXhlY0l0ZXJhdGlvbihwcmlvcktleSwgaSAtIDEsIHRydWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGkgPT09IDApIHtcbiAgICAgIHJldCA9IGludmVyc2UodGhpcyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJldDtcbiAgfSk7XG59XG4iLCJpbXBvcnQgRXhjZXB0aW9uIGZyb20gJy4uL2V4Y2VwdGlvbic7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdoZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oLyogW2FyZ3MsIF1vcHRpb25zICovKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgIC8vIEEgbWlzc2luZyBmaWVsZCBpbiBhIHt7Zm9vfX0gY29uc3RydWN0LlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU29tZW9uZSBpcyBhY3R1YWxseSB0cnlpbmcgdG8gY2FsbCBzb21ldGhpbmcsIGJsb3cgdXAuXG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdNaXNzaW5nIGhlbHBlcjogXCInICsgYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXS5uYW1lICsgJ1wiJyk7XG4gICAgfVxuICB9KTtcbn1cbiIsImltcG9ydCB7aXNFbXB0eSwgaXNGdW5jdGlvbn0gZnJvbSAnLi4vdXRpbHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignaWYnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICAgIGlmIChpc0Z1bmN0aW9uKGNvbmRpdGlvbmFsKSkgeyBjb25kaXRpb25hbCA9IGNvbmRpdGlvbmFsLmNhbGwodGhpcyk7IH1cblxuICAgIC8vIERlZmF1bHQgYmVoYXZpb3IgaXMgdG8gcmVuZGVyIHRoZSBwb3NpdGl2ZSBwYXRoIGlmIHRoZSB2YWx1ZSBpcyB0cnV0aHkgYW5kIG5vdCBlbXB0eS5cbiAgICAvLyBUaGUgYGluY2x1ZGVaZXJvYCBvcHRpb24gbWF5IGJlIHNldCB0byB0cmVhdCB0aGUgY29uZHRpb25hbCBhcyBwdXJlbHkgbm90IGVtcHR5IGJhc2VkIG9uIHRoZVxuICAgIC8vIGJlaGF2aW9yIG9mIGlzRW1wdHkuIEVmZmVjdGl2ZWx5IHRoaXMgZGV0ZXJtaW5lcyBpZiAwIGlzIGhhbmRsZWQgYnkgdGhlIHBvc2l0aXZlIHBhdGggb3IgbmVnYXRpdmUuXG4gICAgaWYgKCghb3B0aW9ucy5oYXNoLmluY2x1ZGVaZXJvICYmICFjb25kaXRpb25hbCkgfHwgaXNFbXB0eShjb25kaXRpb25hbCkpIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmludmVyc2UodGhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmZuKHRoaXMpO1xuICAgIH1cbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ3VubGVzcycsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIGluc3RhbmNlLmhlbHBlcnNbJ2lmJ10uY2FsbCh0aGlzLCBjb25kaXRpb25hbCwge2ZuOiBvcHRpb25zLmludmVyc2UsIGludmVyc2U6IG9wdGlvbnMuZm4sIGhhc2g6IG9wdGlvbnMuaGFzaH0pO1xuICB9KTtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdsb2cnLCBmdW5jdGlvbigvKiBtZXNzYWdlLCBvcHRpb25zICovKSB7XG4gICAgbGV0IGFyZ3MgPSBbdW5kZWZpbmVkXSxcbiAgICAgICAgb3B0aW9ucyA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBhcmdzLnB1c2goYXJndW1lbnRzW2ldKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSAxO1xuICAgIGlmIChvcHRpb25zLmhhc2gubGV2ZWwgIT0gbnVsbCkge1xuICAgICAgbGV2ZWwgPSBvcHRpb25zLmhhc2gubGV2ZWw7XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5kYXRhLmxldmVsICE9IG51bGwpIHtcbiAgICAgIGxldmVsID0gb3B0aW9ucy5kYXRhLmxldmVsO1xuICAgIH1cbiAgICBhcmdzWzBdID0gbGV2ZWw7XG5cbiAgICBpbnN0YW5jZS5sb2coLi4uIGFyZ3MpO1xuICB9KTtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdsb29rdXAnLCBmdW5jdGlvbihvYmosIGZpZWxkKSB7XG4gICAgcmV0dXJuIG9iaiAmJiBvYmpbZmllbGRdO1xuICB9KTtcbn1cbiIsImltcG9ydCB7YXBwZW5kQ29udGV4dFBhdGgsIGJsb2NrUGFyYW1zLCBjcmVhdGVGcmFtZSwgaXNFbXB0eSwgaXNGdW5jdGlvbn0gZnJvbSAnLi4vdXRpbHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignd2l0aCcsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihjb250ZXh0KSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgICBsZXQgZm4gPSBvcHRpb25zLmZuO1xuXG4gICAgaWYgKCFpc0VtcHR5KGNvbnRleHQpKSB7XG4gICAgICBsZXQgZGF0YSA9IG9wdGlvbnMuZGF0YTtcbiAgICAgIGlmIChvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5pZHMpIHtcbiAgICAgICAgZGF0YSA9IGNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gICAgICAgIGRhdGEuY29udGV4dFBhdGggPSBhcHBlbmRDb250ZXh0UGF0aChvcHRpb25zLmRhdGEuY29udGV4dFBhdGgsIG9wdGlvbnMuaWRzWzBdKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZuKGNvbnRleHQsIHtcbiAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgYmxvY2tQYXJhbXM6IGJsb2NrUGFyYW1zKFtjb250ZXh0XSwgW2RhdGEgJiYgZGF0YS5jb250ZXh0UGF0aF0pXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiaW1wb3J0IHtpbmRleE9mfSBmcm9tICcuL3V0aWxzJztcblxubGV0IGxvZ2dlciA9IHtcbiAgbWV0aG9kTWFwOiBbJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddLFxuICBsZXZlbDogJ2luZm8nLFxuXG4gIC8vIE1hcHMgYSBnaXZlbiBsZXZlbCB2YWx1ZSB0byB0aGUgYG1ldGhvZE1hcGAgaW5kZXhlcyBhYm92ZS5cbiAgbG9va3VwTGV2ZWw6IGZ1bmN0aW9uKGxldmVsKSB7XG4gICAgaWYgKHR5cGVvZiBsZXZlbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGxldCBsZXZlbE1hcCA9IGluZGV4T2YobG9nZ2VyLm1ldGhvZE1hcCwgbGV2ZWwudG9Mb3dlckNhc2UoKSk7XG4gICAgICBpZiAobGV2ZWxNYXAgPj0gMCkge1xuICAgICAgICBsZXZlbCA9IGxldmVsTWFwO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV2ZWwgPSBwYXJzZUludChsZXZlbCwgMTApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBsZXZlbDtcbiAgfSxcblxuICAvLyBDYW4gYmUgb3ZlcnJpZGRlbiBpbiB0aGUgaG9zdCBlbnZpcm9ubWVudFxuICBsb2c6IGZ1bmN0aW9uKGxldmVsLCAuLi5tZXNzYWdlKSB7XG4gICAgbGV2ZWwgPSBsb2dnZXIubG9va3VwTGV2ZWwobGV2ZWwpO1xuXG4gICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBsb2dnZXIubG9va3VwTGV2ZWwobG9nZ2VyLmxldmVsKSA8PSBsZXZlbCkge1xuICAgICAgbGV0IG1ldGhvZCA9IGxvZ2dlci5tZXRob2RNYXBbbGV2ZWxdO1xuICAgICAgaWYgKCFjb25zb2xlW21ldGhvZF0pIHsgICAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgbWV0aG9kID0gJ2xvZyc7XG4gICAgICB9XG4gICAgICBjb25zb2xlW21ldGhvZF0oLi4ubWVzc2FnZSk7ICAgIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tY29uc29sZVxuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgbG9nZ2VyO1xuIiwiLyogZ2xvYmFsIHdpbmRvdyAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oSGFuZGxlYmFycykge1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBsZXQgcm9vdCA9IHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDogd2luZG93LFxuICAgICAgJEhhbmRsZWJhcnMgPSByb290LkhhbmRsZWJhcnM7XG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gIEhhbmRsZWJhcnMubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmIChyb290LkhhbmRsZWJhcnMgPT09IEhhbmRsZWJhcnMpIHtcbiAgICAgIHJvb3QuSGFuZGxlYmFycyA9ICRIYW5kbGViYXJzO1xuICAgIH1cbiAgICByZXR1cm4gSGFuZGxlYmFycztcbiAgfTtcbn1cbiIsImltcG9ydCAqIGFzIFV0aWxzIGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IEV4Y2VwdGlvbiBmcm9tICcuL2V4Y2VwdGlvbic7XG5pbXBvcnQgeyBDT01QSUxFUl9SRVZJU0lPTiwgUkVWSVNJT05fQ0hBTkdFUywgY3JlYXRlRnJhbWUgfSBmcm9tICcuL2Jhc2UnO1xuXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tSZXZpc2lvbihjb21waWxlckluZm8pIHtcbiAgY29uc3QgY29tcGlsZXJSZXZpc2lvbiA9IGNvbXBpbGVySW5mbyAmJiBjb21waWxlckluZm9bMF0gfHwgMSxcbiAgICAgICAgY3VycmVudFJldmlzaW9uID0gQ09NUElMRVJfUkVWSVNJT047XG5cbiAgaWYgKGNvbXBpbGVyUmV2aXNpb24gIT09IGN1cnJlbnRSZXZpc2lvbikge1xuICAgIGlmIChjb21waWxlclJldmlzaW9uIDwgY3VycmVudFJldmlzaW9uKSB7XG4gICAgICBjb25zdCBydW50aW1lVmVyc2lvbnMgPSBSRVZJU0lPTl9DSEFOR0VTW2N1cnJlbnRSZXZpc2lvbl0sXG4gICAgICAgICAgICBjb21waWxlclZlcnNpb25zID0gUkVWSVNJT05fQ0hBTkdFU1tjb21waWxlclJldmlzaW9uXTtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1RlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGFuIG9sZGVyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuICcgK1xuICAgICAgICAgICAgJ1BsZWFzZSB1cGRhdGUgeW91ciBwcmVjb21waWxlciB0byBhIG5ld2VyIHZlcnNpb24gKCcgKyBydW50aW1lVmVyc2lvbnMgKyAnKSBvciBkb3duZ3JhZGUgeW91ciBydW50aW1lIHRvIGFuIG9sZGVyIHZlcnNpb24gKCcgKyBjb21waWxlclZlcnNpb25zICsgJykuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVzZSB0aGUgZW1iZWRkZWQgdmVyc2lvbiBpbmZvIHNpbmNlIHRoZSBydW50aW1lIGRvZXNuJ3Qga25vdyBhYm91dCB0aGlzIHJldmlzaW9uIHlldFxuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYSBuZXdlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiAnICtcbiAgICAgICAgICAgICdQbGVhc2UgdXBkYXRlIHlvdXIgcnVudGltZSB0byBhIG5ld2VyIHZlcnNpb24gKCcgKyBjb21waWxlckluZm9bMV0gKyAnKS4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRlbXBsYXRlKHRlbXBsYXRlU3BlYywgZW52KSB7XG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gIGlmICghZW52KSB7XG4gICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignTm8gZW52aXJvbm1lbnQgcGFzc2VkIHRvIHRlbXBsYXRlJyk7XG4gIH1cbiAgaWYgKCF0ZW1wbGF0ZVNwZWMgfHwgIXRlbXBsYXRlU3BlYy5tYWluKSB7XG4gICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignVW5rbm93biB0ZW1wbGF0ZSBvYmplY3Q6ICcgKyB0eXBlb2YgdGVtcGxhdGVTcGVjKTtcbiAgfVxuXG4gIHRlbXBsYXRlU3BlYy5tYWluLmRlY29yYXRvciA9IHRlbXBsYXRlU3BlYy5tYWluX2Q7XG5cbiAgLy8gTm90ZTogVXNpbmcgZW52LlZNIHJlZmVyZW5jZXMgcmF0aGVyIHRoYW4gbG9jYWwgdmFyIHJlZmVyZW5jZXMgdGhyb3VnaG91dCB0aGlzIHNlY3Rpb24gdG8gYWxsb3dcbiAgLy8gZm9yIGV4dGVybmFsIHVzZXJzIHRvIG92ZXJyaWRlIHRoZXNlIGFzIHBzdWVkby1zdXBwb3J0ZWQgQVBJcy5cbiAgZW52LlZNLmNoZWNrUmV2aXNpb24odGVtcGxhdGVTcGVjLmNvbXBpbGVyKTtcblxuICBmdW5jdGlvbiBpbnZva2VQYXJ0aWFsV3JhcHBlcihwYXJ0aWFsLCBjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMuaGFzaCkge1xuICAgICAgY29udGV4dCA9IFV0aWxzLmV4dGVuZCh7fSwgY29udGV4dCwgb3B0aW9ucy5oYXNoKTtcbiAgICAgIGlmIChvcHRpb25zLmlkcykge1xuICAgICAgICBvcHRpb25zLmlkc1swXSA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFydGlhbCA9IGVudi5WTS5yZXNvbHZlUGFydGlhbC5jYWxsKHRoaXMsIHBhcnRpYWwsIGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIGxldCByZXN1bHQgPSBlbnYuVk0uaW52b2tlUGFydGlhbC5jYWxsKHRoaXMsIHBhcnRpYWwsIGNvbnRleHQsIG9wdGlvbnMpO1xuXG4gICAgaWYgKHJlc3VsdCA9PSBudWxsICYmIGVudi5jb21waWxlKSB7XG4gICAgICBvcHRpb25zLnBhcnRpYWxzW29wdGlvbnMubmFtZV0gPSBlbnYuY29tcGlsZShwYXJ0aWFsLCB0ZW1wbGF0ZVNwZWMuY29tcGlsZXJPcHRpb25zLCBlbnYpO1xuICAgICAgcmVzdWx0ID0gb3B0aW9ucy5wYXJ0aWFsc1tvcHRpb25zLm5hbWVdKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH1cbiAgICBpZiAocmVzdWx0ICE9IG51bGwpIHtcbiAgICAgIGlmIChvcHRpb25zLmluZGVudCkge1xuICAgICAgICBsZXQgbGluZXMgPSByZXN1bHQuc3BsaXQoJ1xcbicpO1xuICAgICAgICBmb3IgKGxldCBpID0gMCwgbCA9IGxpbmVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgIGlmICghbGluZXNbaV0gJiYgaSArIDEgPT09IGwpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxpbmVzW2ldID0gb3B0aW9ucy5pbmRlbnQgKyBsaW5lc1tpXTtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSBsaW5lcy5qb2luKCdcXG4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1RoZSBwYXJ0aWFsICcgKyBvcHRpb25zLm5hbWUgKyAnIGNvdWxkIG5vdCBiZSBjb21waWxlZCB3aGVuIHJ1bm5pbmcgaW4gcnVudGltZS1vbmx5IG1vZGUnKTtcbiAgICB9XG4gIH1cblxuICAvLyBKdXN0IGFkZCB3YXRlclxuICBsZXQgY29udGFpbmVyID0ge1xuICAgIHN0cmljdDogZnVuY3Rpb24ob2JqLCBuYW1lKSB7XG4gICAgICBpZiAoIShuYW1lIGluIG9iaikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignXCInICsgbmFtZSArICdcIiBub3QgZGVmaW5lZCBpbiAnICsgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmpbbmFtZV07XG4gICAgfSxcbiAgICBsb29rdXA6IGZ1bmN0aW9uKGRlcHRocywgbmFtZSkge1xuICAgICAgY29uc3QgbGVuID0gZGVwdGhzLmxlbmd0aDtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGRlcHRoc1tpXSAmJiBkZXB0aHNbaV1bbmFtZV0gIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBkZXB0aHNbaV1bbmFtZV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIGxhbWJkYTogZnVuY3Rpb24oY3VycmVudCwgY29udGV4dCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiBjdXJyZW50ID09PSAnZnVuY3Rpb24nID8gY3VycmVudC5jYWxsKGNvbnRleHQpIDogY3VycmVudDtcbiAgICB9LFxuXG4gICAgZXNjYXBlRXhwcmVzc2lvbjogVXRpbHMuZXNjYXBlRXhwcmVzc2lvbixcbiAgICBpbnZva2VQYXJ0aWFsOiBpbnZva2VQYXJ0aWFsV3JhcHBlcixcblxuICAgIGZuOiBmdW5jdGlvbihpKSB7XG4gICAgICBsZXQgcmV0ID0gdGVtcGxhdGVTcGVjW2ldO1xuICAgICAgcmV0LmRlY29yYXRvciA9IHRlbXBsYXRlU3BlY1tpICsgJ19kJ107XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH0sXG5cbiAgICBwcm9ncmFtczogW10sXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZGF0YSwgZGVjbGFyZWRCbG9ja1BhcmFtcywgYmxvY2tQYXJhbXMsIGRlcHRocykge1xuICAgICAgbGV0IHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXSxcbiAgICAgICAgICBmbiA9IHRoaXMuZm4oaSk7XG4gICAgICBpZiAoZGF0YSB8fCBkZXB0aHMgfHwgYmxvY2tQYXJhbXMgfHwgZGVjbGFyZWRCbG9ja1BhcmFtcykge1xuICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHdyYXBQcm9ncmFtKHRoaXMsIGksIGZuLCBkYXRhLCBkZWNsYXJlZEJsb2NrUGFyYW1zLCBibG9ja1BhcmFtcywgZGVwdGhzKTtcbiAgICAgIH0gZWxzZSBpZiAoIXByb2dyYW1XcmFwcGVyKSB7XG4gICAgICAgIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXSA9IHdyYXBQcm9ncmFtKHRoaXMsIGksIGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtV3JhcHBlcjtcbiAgICB9LFxuXG4gICAgZGF0YTogZnVuY3Rpb24odmFsdWUsIGRlcHRoKSB7XG4gICAgICB3aGlsZSAodmFsdWUgJiYgZGVwdGgtLSkge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlLl9wYXJlbnQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSxcbiAgICBtZXJnZTogZnVuY3Rpb24ocGFyYW0sIGNvbW1vbikge1xuICAgICAgbGV0IG9iaiA9IHBhcmFtIHx8IGNvbW1vbjtcblxuICAgICAgaWYgKHBhcmFtICYmIGNvbW1vbiAmJiAocGFyYW0gIT09IGNvbW1vbikpIHtcbiAgICAgICAgb2JqID0gVXRpbHMuZXh0ZW5kKHt9LCBjb21tb24sIHBhcmFtKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9LFxuXG4gICAgbm9vcDogZW52LlZNLm5vb3AsXG4gICAgY29tcGlsZXJJbmZvOiB0ZW1wbGF0ZVNwZWMuY29tcGlsZXJcbiAgfTtcblxuICBmdW5jdGlvbiByZXQoY29udGV4dCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgbGV0IGRhdGEgPSBvcHRpb25zLmRhdGE7XG5cbiAgICByZXQuX3NldHVwKG9wdGlvbnMpO1xuICAgIGlmICghb3B0aW9ucy5wYXJ0aWFsICYmIHRlbXBsYXRlU3BlYy51c2VEYXRhKSB7XG4gICAgICBkYXRhID0gaW5pdERhdGEoY29udGV4dCwgZGF0YSk7XG4gICAgfVxuICAgIGxldCBkZXB0aHMsXG4gICAgICAgIGJsb2NrUGFyYW1zID0gdGVtcGxhdGVTcGVjLnVzZUJsb2NrUGFyYW1zID8gW10gOiB1bmRlZmluZWQ7XG4gICAgaWYgKHRlbXBsYXRlU3BlYy51c2VEZXB0aHMpIHtcbiAgICAgIGlmIChvcHRpb25zLmRlcHRocykge1xuICAgICAgICBkZXB0aHMgPSBjb250ZXh0ICE9PSBvcHRpb25zLmRlcHRoc1swXSA/IFtjb250ZXh0XS5jb25jYXQob3B0aW9ucy5kZXB0aHMpIDogb3B0aW9ucy5kZXB0aHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZXB0aHMgPSBbY29udGV4dF07XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWFpbihjb250ZXh0LyosIG9wdGlvbnMqLykge1xuICAgICAgcmV0dXJuICcnICsgdGVtcGxhdGVTcGVjLm1haW4oY29udGFpbmVyLCBjb250ZXh0LCBjb250YWluZXIuaGVscGVycywgY29udGFpbmVyLnBhcnRpYWxzLCBkYXRhLCBibG9ja1BhcmFtcywgZGVwdGhzKTtcbiAgICB9XG4gICAgbWFpbiA9IGV4ZWN1dGVEZWNvcmF0b3JzKHRlbXBsYXRlU3BlYy5tYWluLCBtYWluLCBjb250YWluZXIsIG9wdGlvbnMuZGVwdGhzIHx8IFtdLCBkYXRhLCBibG9ja1BhcmFtcyk7XG4gICAgcmV0dXJuIG1haW4oY29udGV4dCwgb3B0aW9ucyk7XG4gIH1cbiAgcmV0LmlzVG9wID0gdHJ1ZTtcblxuICByZXQuX3NldHVwID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucy5wYXJ0aWFsKSB7XG4gICAgICBjb250YWluZXIuaGVscGVycyA9IGNvbnRhaW5lci5tZXJnZShvcHRpb25zLmhlbHBlcnMsIGVudi5oZWxwZXJzKTtcblxuICAgICAgaWYgKHRlbXBsYXRlU3BlYy51c2VQYXJ0aWFsKSB7XG4gICAgICAgIGNvbnRhaW5lci5wYXJ0aWFscyA9IGNvbnRhaW5lci5tZXJnZShvcHRpb25zLnBhcnRpYWxzLCBlbnYucGFydGlhbHMpO1xuICAgICAgfVxuICAgICAgaWYgKHRlbXBsYXRlU3BlYy51c2VQYXJ0aWFsIHx8IHRlbXBsYXRlU3BlYy51c2VEZWNvcmF0b3JzKSB7XG4gICAgICAgIGNvbnRhaW5lci5kZWNvcmF0b3JzID0gY29udGFpbmVyLm1lcmdlKG9wdGlvbnMuZGVjb3JhdG9ycywgZW52LmRlY29yYXRvcnMpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb250YWluZXIuaGVscGVycyA9IG9wdGlvbnMuaGVscGVycztcbiAgICAgIGNvbnRhaW5lci5wYXJ0aWFscyA9IG9wdGlvbnMucGFydGlhbHM7XG4gICAgICBjb250YWluZXIuZGVjb3JhdG9ycyA9IG9wdGlvbnMuZGVjb3JhdG9ycztcbiAgICB9XG4gIH07XG5cbiAgcmV0Ll9jaGlsZCA9IGZ1bmN0aW9uKGksIGRhdGEsIGJsb2NrUGFyYW1zLCBkZXB0aHMpIHtcbiAgICBpZiAodGVtcGxhdGVTcGVjLnVzZUJsb2NrUGFyYW1zICYmICFibG9ja1BhcmFtcykge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignbXVzdCBwYXNzIGJsb2NrIHBhcmFtcycpO1xuICAgIH1cbiAgICBpZiAodGVtcGxhdGVTcGVjLnVzZURlcHRocyAmJiAhZGVwdGhzKSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdtdXN0IHBhc3MgcGFyZW50IGRlcHRocycpO1xuICAgIH1cblxuICAgIHJldHVybiB3cmFwUHJvZ3JhbShjb250YWluZXIsIGksIHRlbXBsYXRlU3BlY1tpXSwgZGF0YSwgMCwgYmxvY2tQYXJhbXMsIGRlcHRocyk7XG4gIH07XG4gIHJldHVybiByZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3cmFwUHJvZ3JhbShjb250YWluZXIsIGksIGZuLCBkYXRhLCBkZWNsYXJlZEJsb2NrUGFyYW1zLCBibG9ja1BhcmFtcywgZGVwdGhzKSB7XG4gIGZ1bmN0aW9uIHByb2coY29udGV4dCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgbGV0IGN1cnJlbnREZXB0aHMgPSBkZXB0aHM7XG4gICAgaWYgKGRlcHRocyAmJiBjb250ZXh0ICE9PSBkZXB0aHNbMF0pIHtcbiAgICAgIGN1cnJlbnREZXB0aHMgPSBbY29udGV4dF0uY29uY2F0KGRlcHRocyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZuKGNvbnRhaW5lcixcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgY29udGFpbmVyLmhlbHBlcnMsIGNvbnRhaW5lci5wYXJ0aWFscyxcbiAgICAgICAgb3B0aW9ucy5kYXRhIHx8IGRhdGEsXG4gICAgICAgIGJsb2NrUGFyYW1zICYmIFtvcHRpb25zLmJsb2NrUGFyYW1zXS5jb25jYXQoYmxvY2tQYXJhbXMpLFxuICAgICAgICBjdXJyZW50RGVwdGhzKTtcbiAgfVxuXG4gIHByb2cgPSBleGVjdXRlRGVjb3JhdG9ycyhmbiwgcHJvZywgY29udGFpbmVyLCBkZXB0aHMsIGRhdGEsIGJsb2NrUGFyYW1zKTtcblxuICBwcm9nLnByb2dyYW0gPSBpO1xuICBwcm9nLmRlcHRoID0gZGVwdGhzID8gZGVwdGhzLmxlbmd0aCA6IDA7XG4gIHByb2cuYmxvY2tQYXJhbXMgPSBkZWNsYXJlZEJsb2NrUGFyYW1zIHx8IDA7XG4gIHJldHVybiBwcm9nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVBhcnRpYWwocGFydGlhbCwgY29udGV4dCwgb3B0aW9ucykge1xuICBpZiAoIXBhcnRpYWwpIHtcbiAgICBpZiAob3B0aW9ucy5uYW1lID09PSAnQHBhcnRpYWwtYmxvY2snKSB7XG4gICAgICBwYXJ0aWFsID0gb3B0aW9ucy5kYXRhWydwYXJ0aWFsLWJsb2NrJ107XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcnRpYWwgPSBvcHRpb25zLnBhcnRpYWxzW29wdGlvbnMubmFtZV07XG4gICAgfVxuICB9IGVsc2UgaWYgKCFwYXJ0aWFsLmNhbGwgJiYgIW9wdGlvbnMubmFtZSkge1xuICAgIC8vIFRoaXMgaXMgYSBkeW5hbWljIHBhcnRpYWwgdGhhdCByZXR1cm5lZCBhIHN0cmluZ1xuICAgIG9wdGlvbnMubmFtZSA9IHBhcnRpYWw7XG4gICAgcGFydGlhbCA9IG9wdGlvbnMucGFydGlhbHNbcGFydGlhbF07XG4gIH1cbiAgcmV0dXJuIHBhcnRpYWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZva2VQYXJ0aWFsKHBhcnRpYWwsIGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucy5wYXJ0aWFsID0gdHJ1ZTtcbiAgaWYgKG9wdGlvbnMuaWRzKSB7XG4gICAgb3B0aW9ucy5kYXRhLmNvbnRleHRQYXRoID0gb3B0aW9ucy5pZHNbMF0gfHwgb3B0aW9ucy5kYXRhLmNvbnRleHRQYXRoO1xuICB9XG5cbiAgbGV0IHBhcnRpYWxCbG9jaztcbiAgaWYgKG9wdGlvbnMuZm4gJiYgb3B0aW9ucy5mbiAhPT0gbm9vcCkge1xuICAgIG9wdGlvbnMuZGF0YSA9IGNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gICAgcGFydGlhbEJsb2NrID0gb3B0aW9ucy5kYXRhWydwYXJ0aWFsLWJsb2NrJ10gPSBvcHRpb25zLmZuO1xuXG4gICAgaWYgKHBhcnRpYWxCbG9jay5wYXJ0aWFscykge1xuICAgICAgb3B0aW9ucy5wYXJ0aWFscyA9IFV0aWxzLmV4dGVuZCh7fSwgb3B0aW9ucy5wYXJ0aWFscywgcGFydGlhbEJsb2NrLnBhcnRpYWxzKTtcbiAgICB9XG4gIH1cblxuICBpZiAocGFydGlhbCA9PT0gdW5kZWZpbmVkICYmIHBhcnRpYWxCbG9jaykge1xuICAgIHBhcnRpYWwgPSBwYXJ0aWFsQmxvY2s7XG4gIH1cblxuICBpZiAocGFydGlhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignVGhlIHBhcnRpYWwgJyArIG9wdGlvbnMubmFtZSArICcgY291bGQgbm90IGJlIGZvdW5kJyk7XG4gIH0gZWxzZSBpZiAocGFydGlhbCBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgcmV0dXJuIHBhcnRpYWwoY29udGV4dCwgb3B0aW9ucyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vb3AoKSB7IHJldHVybiAnJzsgfVxuXG5mdW5jdGlvbiBpbml0RGF0YShjb250ZXh0LCBkYXRhKSB7XG4gIGlmICghZGF0YSB8fCAhKCdyb290JyBpbiBkYXRhKSkge1xuICAgIGRhdGEgPSBkYXRhID8gY3JlYXRlRnJhbWUoZGF0YSkgOiB7fTtcbiAgICBkYXRhLnJvb3QgPSBjb250ZXh0O1xuICB9XG4gIHJldHVybiBkYXRhO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlRGVjb3JhdG9ycyhmbiwgcHJvZywgY29udGFpbmVyLCBkZXB0aHMsIGRhdGEsIGJsb2NrUGFyYW1zKSB7XG4gIGlmIChmbi5kZWNvcmF0b3IpIHtcbiAgICBsZXQgcHJvcHMgPSB7fTtcbiAgICBwcm9nID0gZm4uZGVjb3JhdG9yKHByb2csIHByb3BzLCBjb250YWluZXIsIGRlcHRocyAmJiBkZXB0aHNbMF0sIGRhdGEsIGJsb2NrUGFyYW1zLCBkZXB0aHMpO1xuICAgIFV0aWxzLmV4dGVuZChwcm9nLCBwcm9wcyk7XG4gIH1cbiAgcmV0dXJuIHByb2c7XG59XG4iLCIvLyBCdWlsZCBvdXQgb3VyIGJhc2ljIFNhZmVTdHJpbmcgdHlwZVxuZnVuY3Rpb24gU2FmZVN0cmluZyhzdHJpbmcpIHtcbiAgdGhpcy5zdHJpbmcgPSBzdHJpbmc7XG59XG5cblNhZmVTdHJpbmcucHJvdG90eXBlLnRvU3RyaW5nID0gU2FmZVN0cmluZy5wcm90b3R5cGUudG9IVE1MID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAnJyArIHRoaXMuc3RyaW5nO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgU2FmZVN0cmluZztcbiIsImNvbnN0IGVzY2FwZSA9IHtcbiAgJyYnOiAnJmFtcDsnLFxuICAnPCc6ICcmbHQ7JyxcbiAgJz4nOiAnJmd0OycsXG4gICdcIic6ICcmcXVvdDsnLFxuICBcIidcIjogJyYjeDI3OycsXG4gICdgJzogJyYjeDYwOycsXG4gICc9JzogJyYjeDNEOydcbn07XG5cbmNvbnN0IGJhZENoYXJzID0gL1smPD5cIidgPV0vZyxcbiAgICAgIHBvc3NpYmxlID0gL1smPD5cIidgPV0vO1xuXG5mdW5jdGlvbiBlc2NhcGVDaGFyKGNocikge1xuICByZXR1cm4gZXNjYXBlW2Nocl07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRlbmQob2JqLyogLCAuLi5zb3VyY2UgKi8pIHtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGxldCBrZXkgaW4gYXJndW1lbnRzW2ldKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGFyZ3VtZW50c1tpXSwga2V5KSkge1xuICAgICAgICBvYmpba2V5XSA9IGFyZ3VtZW50c1tpXVtrZXldO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59XG5cbmV4cG9ydCBsZXQgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vLyBTb3VyY2VkIGZyb20gbG9kYXNoXG4vLyBodHRwczovL2dpdGh1Yi5jb20vYmVzdGllanMvbG9kYXNoL2Jsb2IvbWFzdGVyL0xJQ0VOU0UudHh0XG4vKiBlc2xpbnQtZGlzYWJsZSBmdW5jLXN0eWxlICovXG5sZXQgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbic7XG59O1xuLy8gZmFsbGJhY2sgZm9yIG9sZGVyIHZlcnNpb25zIG9mIENocm9tZSBhbmQgU2FmYXJpXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuaWYgKGlzRnVuY3Rpb24oL3gvKSkge1xuICBpc0Z1bmN0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBGdW5jdGlvbl0nO1xuICB9O1xufVxuZXhwb3J0IHtpc0Z1bmN0aW9ufTtcbi8qIGVzbGludC1lbmFibGUgZnVuYy1zdHlsZSAqL1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZXhwb3J0IGNvbnN0IGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JykgPyB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gJ1tvYmplY3QgQXJyYXldJyA6IGZhbHNlO1xufTtcblxuLy8gT2xkZXIgSUUgdmVyc2lvbnMgZG8gbm90IGRpcmVjdGx5IHN1cHBvcnQgaW5kZXhPZiBzbyB3ZSBtdXN0IGltcGxlbWVudCBvdXIgb3duLCBzYWRseS5cbmV4cG9ydCBmdW5jdGlvbiBpbmRleE9mKGFycmF5LCB2YWx1ZSkge1xuICBmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoYXJyYXlbaV0gPT09IHZhbHVlKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVFeHByZXNzaW9uKHN0cmluZykge1xuICBpZiAodHlwZW9mIHN0cmluZyAhPT0gJ3N0cmluZycpIHtcbiAgICAvLyBkb24ndCBlc2NhcGUgU2FmZVN0cmluZ3MsIHNpbmNlIHRoZXkncmUgYWxyZWFkeSBzYWZlXG4gICAgaWYgKHN0cmluZyAmJiBzdHJpbmcudG9IVE1MKSB7XG4gICAgICByZXR1cm4gc3RyaW5nLnRvSFRNTCgpO1xuICAgIH0gZWxzZSBpZiAoc3RyaW5nID09IG51bGwpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9IGVsc2UgaWYgKCFzdHJpbmcpIHtcbiAgICAgIHJldHVybiBzdHJpbmcgKyAnJztcbiAgICB9XG5cbiAgICAvLyBGb3JjZSBhIHN0cmluZyBjb252ZXJzaW9uIGFzIHRoaXMgd2lsbCBiZSBkb25lIGJ5IHRoZSBhcHBlbmQgcmVnYXJkbGVzcyBhbmRcbiAgICAvLyB0aGUgcmVnZXggdGVzdCB3aWxsIGRvIHRoaXMgdHJhbnNwYXJlbnRseSBiZWhpbmQgdGhlIHNjZW5lcywgY2F1c2luZyBpc3N1ZXMgaWZcbiAgICAvLyBhbiBvYmplY3QncyB0byBzdHJpbmcgaGFzIGVzY2FwZWQgY2hhcmFjdGVycyBpbiBpdC5cbiAgICBzdHJpbmcgPSAnJyArIHN0cmluZztcbiAgfVxuXG4gIGlmICghcG9zc2libGUudGVzdChzdHJpbmcpKSB7IHJldHVybiBzdHJpbmc7IH1cbiAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKGJhZENoYXJzLCBlc2NhcGVDaGFyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHkodmFsdWUpIHtcbiAgaWYgKCF2YWx1ZSAmJiB2YWx1ZSAhPT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRnJhbWUob2JqZWN0KSB7XG4gIGxldCBmcmFtZSA9IGV4dGVuZCh7fSwgb2JqZWN0KTtcbiAgZnJhbWUuX3BhcmVudCA9IG9iamVjdDtcbiAgcmV0dXJuIGZyYW1lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmxvY2tQYXJhbXMocGFyYW1zLCBpZHMpIHtcbiAgcGFyYW1zLnBhdGggPSBpZHM7XG4gIHJldHVybiBwYXJhbXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBlbmRDb250ZXh0UGF0aChjb250ZXh0UGF0aCwgaWQpIHtcbiAgcmV0dXJuIChjb250ZXh0UGF0aCA/IGNvbnRleHRQYXRoICsgJy4nIDogJycpICsgaWQ7XG59XG4iLCIvLyBDcmVhdGUgYSBzaW1wbGUgcGF0aCBhbGlhcyB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHJlc29sdmVcbi8vIHRoZSBydW50aW1lIG9uIGEgc3VwcG9ydGVkIHBhdGguXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGlzdC9janMvaGFuZGxlYmFycy5ydW50aW1lJylbJ2RlZmF1bHQnXTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImhhbmRsZWJhcnMvcnVudGltZVwiKVtcImRlZmF1bHRcIl07XG4iLCIvLyBoYnNmeSBjb21waWxlZCBIYW5kbGViYXJzIHRlbXBsYXRlXG52YXIgSGFuZGxlYmFyc0NvbXBpbGVyID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzQ29tcGlsZXIudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbNyxcIj49IDQuMC4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgaGVscGVyO1xuXG4gIHJldHVybiBcIjxoZWFkPlxcbiAgPG1ldGEgY2hhcnNldD1cXFwidXRmLThcXFwiPlxcbiAgPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PUluY29uc29sYXRhXFxcIj5cXG4gIDxzdHlsZSB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCI+XCJcbiAgICArICgoc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5jc3MgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmNzcyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBoZWxwZXJzLmhlbHBlck1pc3NpbmcpLCh0eXBlb2YgaGVscGVyID09PSBcImZ1bmN0aW9uXCIgPyBoZWxwZXIuY2FsbChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LHtcIm5hbWVcIjpcImNzc1wiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiPC9zdHlsZT5cXG48L2hlYWQ+XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiAgICAgICAgKFwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmFudGUgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCIpXFxuXCI7XG59LFwiM1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgYWxpYXMxPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge307XG5cbiAgcmV0dXJuIFwiICAgICAgXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQxIDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSg0LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCJcXG4gICAgICBcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDIgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDYsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMyA6IHN0YWNrMSkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oOCwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuICAgICAgXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQ0IDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxMCwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuICAgICAgXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQ1IDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxMiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuXCI7XG59LFwiNFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMSA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgXCI7XG59LFwiNlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMiA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgXCI7XG59LFwiOFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMyA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgXCI7XG59LFwiMTBcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiIFwiXG4gICAgKyAoKHN0YWNrMSA9IGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDQgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiIFwiO1xufSxcIjEyXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiBcIlxuICAgICsgKChzdGFjazEgPSBjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQ1IDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCIxNFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiICAgICAgJm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7XFxuXCI7XG59LFwiMTZcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlciwgb3B0aW9ucywgYWxpYXMxPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sIGFsaWFzMj1oZWxwZXJzLmhlbHBlck1pc3NpbmcsIGFsaWFzMz1cImZ1bmN0aW9uXCIsIGFsaWFzND1oZWxwZXJzLmJsb2NrSGVscGVyTWlzc2luZywgYnVmZmVyID0gXG4gIFwiICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtZGF0ZVxcXCI+XFxuICAgICAgXCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMTcsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM0LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgYnVmZmVyICs9IFwiL1wiO1xuICBzdGFjazEgPSAoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR3b2RpZ2l0cyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudHdvZGlnaXRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKG9wdGlvbnM9e1wibmFtZVwiOlwidHdvZGlnaXRzXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDE5LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSxvcHRpb25zKSA6IGhlbHBlcikpO1xuICBpZiAoIWhlbHBlcnMudHdvZGlnaXRzKSB7IHN0YWNrMSA9IGFsaWFzNC5jYWxsKGRlcHRoMCxzdGFjazEsb3B0aW9ucyl9XG4gIGlmIChzdGFjazEgIT0gbnVsbCkgeyBidWZmZXIgKz0gc3RhY2sxOyB9XG4gIHJldHVybiBidWZmZXIgKyBcIi9cIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS55ZWFyIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxuICAgIDwvc3Bhbj5cXG5cIjtcbn0sXCIxN1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5tb250aCA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjE5XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmRheSA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmhvdXIgOiBzdGFjazEpLCBkZXB0aDApKTtcbn0sXCIyM1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5taW4gOiBzdGFjazEpLCBkZXB0aDApKTtcbn0sXCIyNVwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5zZWMgOiBzdGFjazEpLCBkZXB0aDApKTtcbn0sXCIyN1wiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiIFQ6IFwiO1xufSxcIjI5XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LCBhbGlhczI9aGVscGVycy5oZWxwZXJNaXNzaW5nLCBhbGlhczM9XCJmdW5jdGlvblwiLCBhbGlhczQ9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGFsaWFzNT1jb250YWluZXIubGFtYmRhO1xuXG4gIHJldHVybiBcIiAgICAgIDx0ciBjbGFzcz1cXFwiaGh2LXBsYXllciBcIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucGxheWVyQWN0aXZpdHkgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnBsYXllckFjdGl2aXR5IDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJwbGF5ZXJBY3Rpdml0eVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCJcXFwiPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5wb3MgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnBvcyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwicG9zXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLm5hbWUgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLm5hbWUgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcIm5hbWVcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgKChzdGFjazEgPSBhbGlhczUoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRDYXJkcyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDEgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArICgoc3RhY2sxID0gYWxpYXM1KCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQ2FyZHMgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQyIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLm0gfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLm0gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcIm1cIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucHJlZmxvcCB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucHJlZmxvcCA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwicHJlZmxvcFwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5mbG9wIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5mbG9wIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJmbG9wXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR1cm4gfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR1cm4gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInR1cm5cIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucml2ZXIgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJpdmVyIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJyaXZlclwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5zaG93ZG93biB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuc2hvd2Rvd24gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInNob3dkb3duXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgPC90cj5cXG5cIjtcbn0sXCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIG9wdGlvbnMsIGFsaWFzMT1jb250YWluZXIubGFtYmRhLCBhbGlhczI9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24sIGFsaWFzMz1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LCBhbGlhczQ9aGVscGVycy5oZWxwZXJNaXNzaW5nLCBhbGlhczU9XCJmdW5jdGlvblwiLCBhbGlhczY9aGVscGVycy5ibG9ja0hlbHBlck1pc3NpbmcsIGJ1ZmZlciA9IFxuICBcIjxkaXYgY2xhc3M9XFxcImhodi1oYW5kIFwiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmFueUFjdGl2aXR5IDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiIFwiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnBsYXllckFjdGl2aXR5IDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImhodi1oZWFkZXJcXFwiPlxcbiAgICA8c3BhbiBjbGFzcz1cXFwiaGh2LWJiLXNiLWFudGUtbWF4XFxcIj5cXG4gICAgICAoXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuYmIgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCIvXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuc2IgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCIpXFxuXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMzLCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmFudGUgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgICAgIFtcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50YWJsZSA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEubWF4c2VhdHMgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCJdXFxuICAgIDwvc3Bhbj5cXG4gICAgPHNwYW4gY2xhc3M9XFxcImhodi1ib2FyZFxcXCI+XFxuXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMzLChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgzLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIucHJvZ3JhbSgxNCwgZGF0YSwgMCksXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgIDwvc3Bhbj5cXG5cIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczMsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZGF5IDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxNiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtZGF0ZVxcXCI+XFxuICAgICAgXCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXM0KSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMjEsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXM1ID8gaGVscGVyLmNhbGwoYWxpYXMzLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM2LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgYnVmZmVyICs9IFwiOlwiO1xuICBzdGFjazEgPSAoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR3b2RpZ2l0cyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudHdvZGlnaXRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzNCksKG9wdGlvbnM9e1wibmFtZVwiOlwidHdvZGlnaXRzXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDIzLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzNSA/IGhlbHBlci5jYWxsKGFsaWFzMyxvcHRpb25zKSA6IGhlbHBlcikpO1xuICBpZiAoIWhlbHBlcnMudHdvZGlnaXRzKSB7IHN0YWNrMSA9IGFsaWFzNi5jYWxsKGRlcHRoMCxzdGFjazEsb3B0aW9ucyl9XG4gIGlmIChzdGFjazEgIT0gbnVsbCkgeyBidWZmZXIgKz0gc3RhY2sxOyB9XG4gIGJ1ZmZlciArPSBcIjpcIjtcbiAgc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy50d29kaWdpdHMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR3b2RpZ2l0cyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczQpLChvcHRpb25zPXtcIm5hbWVcIjpcInR3b2RpZ2l0c1wiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgyNSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczUgPyBoZWxwZXIuY2FsbChhbGlhczMsb3B0aW9ucykgOiBoZWxwZXIpKTtcbiAgaWYgKCFoZWxwZXJzLnR3b2RpZ2l0cykgeyBzdGFjazEgPSBhbGlhczYuY2FsbChkZXB0aDAsc3RhY2sxLG9wdGlvbnMpfVxuICBpZiAoc3RhY2sxICE9IG51bGwpIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICByZXR1cm4gYnVmZmVyICsgXCJcXG4gICAgPC9zcGFuPlxcbiAgICA8c3BhbiBjbGFzcz1cXFwiaGh2LWdhbWVpbmZvXFxcIj5cXG4gICAgICBcIlxuICAgICsgKChzdGFjazEgPSAoaGVscGVycy5pZnZhbHVlIHx8IChkZXB0aDAgJiYgZGVwdGgwLmlmdmFsdWUpIHx8IGFsaWFzNCkuY2FsbChhbGlhczMsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZ2FtZXR5cGUgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmdmFsdWVcIixcImhhc2hcIjp7XCJ2YWx1ZVwiOlwidG91cm5hbWVudFwifSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMjcsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmdhbWVubyA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcbiAgICAgIEc6IFwiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmhhbmRpZCA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcbiAgICA8L3NwYW4+XFxuICA8L2Rpdj5cXG4gIDxkaXYgY2xhc3M9XFxcImhodi10YWJsZVxcXCI+XFxuICAgIDx0YWJsZT5cXG4gICAgICA8dGhlYWQ+XFxuICAgICAgPHRyPlxcbiAgICAgICAgPHRoPlBvczwvdGg+XFxuICAgICAgICA8dGg+TmFtZTwvdGg+XFxuICAgICAgICA8dGg+Q2FyZHM8L3RoPlxcbiAgICAgICAgPHRoPk08L3RoPlxcbiAgICAgICAgPHRoPlByZWZsb3A8L3RoPlxcbiAgICAgICAgPHRoPkZsb3A8L3RoPlxcbiAgICAgICAgPHRoPlR1cm48L3RoPlxcbiAgICAgICAgPHRoPlJpdmVyPC90aD5cXG4gICAgICA8L3RyPlxcbiAgICAgIDwvdGhlYWQ+XFxuICAgICAgPHRib2R5PlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnMuZWFjaC5jYWxsKGFsaWFzMywoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRQbGF5ZXJzIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJlYWNoXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDI5LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgICA8L3Rib2R5PlxcbiAgICA8L3RhYmxlPlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgaGVscGVyLCBhbGlhczE9ZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwgYWxpYXMyPWhlbHBlcnMuaGVscGVyTWlzc2luZywgYWxpYXMzPVwiZnVuY3Rpb25cIiwgYWxpYXM0PWNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uO1xuXG4gIHJldHVybiBcIi5oaHYtaGFuZCB7XFxuICBkaXNwbGF5OiBub25lO1xcbn1cXG4uaGh2LXBsYXllciB7XFxuICBkaXNwbGF5OiBub25lO1xcbn1cXG4uaGh2LXBsYXllclwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5wbGF5ZXJzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5wbGF5ZXJzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJwbGF5ZXJzXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIiB7XFxuICBkaXNwbGF5OiB0YWJsZS1yb3c7XFxufVxcbi5oaHYtaGFuZFwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5oYW5kIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5oYW5kIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJoYW5kXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIiB7XFxuICBkaXNwbGF5OiBibG9jaztcXG59XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgaGVscGVyO1xuXG4gIHJldHVybiBcInRyLlwiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbigoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLm5hbWUgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLm5hbWUgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogaGVscGVycy5oZWxwZXJNaXNzaW5nKSwodHlwZW9mIGhlbHBlciA9PT0gXCJmdW5jdGlvblwiID8gaGVscGVyLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSx7XCJuYW1lXCI6XCJuYW1lXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIiB7XFxuICBiYWNrZ3JvdW5kOiByZ2JhKDIxMCwyNTUsODIsMSk7XFxuICBiYWNrZ3JvdW5kOiAtbW96LWxpbmVhci1ncmFkaWVudCh0b3AsIHJnYmEoMjEwLDI1NSw4MiwxKSAwJSwgcmdiYSgxNDUsMjMyLDY2LDEpIDEwMCUpO1xcbiAgYmFja2dyb3VuZDogLXdlYmtpdC1ncmFkaWVudChsZWZ0IHRvcCwgbGVmdCBib3R0b20sIGNvbG9yLXN0b3AoMCUsIHJnYmEoMjEwLDI1NSw4MiwxKSksIGNvbG9yLXN0b3AoMTAwJSwgcmdiYSgxNDUsMjMyLDY2LDEpKSk7XFxuICBiYWNrZ3JvdW5kOiAtd2Via2l0LWxpbmVhci1ncmFkaWVudCh0b3AsIHJnYmEoMjEwLDI1NSw4MiwxKSAwJSwgcmdiYSgxNDUsMjMyLDY2LDEpIDEwMCUpO1xcbiAgYmFja2dyb3VuZDogLW8tbGluZWFyLWdyYWRpZW50KHRvcCwgcmdiYSgyMTAsMjU1LDgyLDEpIDAlLCByZ2JhKDE0NSwyMzIsNjYsMSkgMTAwJSk7XFxuICBiYWNrZ3JvdW5kOiAtbXMtbGluZWFyLWdyYWRpZW50KHRvcCwgcmdiYSgyMTAsMjU1LDgyLDEpIDAlLCByZ2JhKDE0NSwyMzIsNjYsMSkgMTAwJSk7XFxuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQodG8gYm90dG9tLCByZ2JhKDIxMCwyNTUsODIsMSkgMCUsIHJnYmEoMTQ1LDIzMiw2NiwxKSAxMDAlKTtcXG4gIGZpbHRlcjogcHJvZ2lkOkRYSW1hZ2VUcmFuc2Zvcm0uTWljcm9zb2Z0LmdyYWRpZW50KCBzdGFydENvbG9yc3RyPScjZDJmZjUyJywgZW5kQ29sb3JzdHI9JyM5MWU4NDInLCBHcmFkaWVudFR5cGU9MCApO1xcbn1cXG5cIjtcbn0sXCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnNlbGVjdGVkIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKTtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHJldHVybiBcIi5oaHYtaGFuZCB7XFxuICB3aWR0aDogNzAwcHg7XFxuICBiYWNrZ3JvdW5kOiAjMzMzO1xcbiAgYm9yZGVyOiAxcHggc29saWQgIzMzMztcXG4gIGJvcmRlci1yYWRpdXM6IDZweCA2cHggMCAwO1xcbiAgYm94LXNoYWRvdzogNnB4IDZweCAxMnB4ICM4ODg7XFxuICBtYXJnaW46IDAgMCAxMHB4IDA7XFxufVxcbi5oaHYtaGVhZGVyIHtcXG4gIGNvbG9yOiB5ZWxsb3dncmVlbjtcXG4gIGhlaWdodDogMjBweDtcXG4gIHBhZGRpbmc6IDJweDtcXG4gIGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XFxufVxcbi5oaHYtYm9hcmQge1xcbiAgYmFja2dyb3VuZDogYW50aXF1ZXdoaXRlO1xcbiAgYm9yZGVyLXJhZGl1czogM3B4O1xcbiAgaGVpZ2h0OiAyMHB4O1xcbiAgY29sb3I6IGJsYWNrO1xcbiAgcGFkZGluZzogMXB4IDBweCAxcHggMnB4O1xcbiAgbWFyZ2luLXJpZ2h0OiAzcHg7XFxuICBtaW4td2lkdGg6IDYwcHg7XFxufVxcbi5oaHYtY2FyZC12YWx1ZSxcXG4uaGh2LWNhcmQtc3VpdCB7XFxuICBmb250LWZhbWlseTogdmVyZGFuYTtcXG4gIGZvbnQtc2l6ZTogMTNweDtcXG59XFxuLmhodi1jYXJkLXN1aXQge1xcbiAgbWFyZ2luLXJpZ2h0OiAycHg7XFxuICBmb250LXNpemU6IDE1cHg7XFxufVxcbi5oaHYtY2FyZC1zdWl0LnMsXFxuLmhodi1jYXJkLXN1aXQuYyB7XFxuICBjb2xvcjogYmxhY2s7XFxufVxcbi5oaHYtY2FyZC1zdWl0LmQsXFxuLmhodi1jYXJkLXN1aXQuaCB7XFxuICBjb2xvcjogcmVkO1xcbn1cXG4uaGh2LXRhYmxlIHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgZm9udC1mYW1pbHk6IEluY29uc29sYXRhLCBtb25vc3BhY2U7XFxufVxcbi5oaHYtdGFibGUgdGFibGUge1xcbiAgYm9yZGVyLXNwYWNpbmc6IDA7XFxufVxcblxcbi5oaHYtdGFibGUgdGgge1xcbiAgdGV4dC1hbGlnbjogbGVmdDtcXG4gIGZvbnQtc2l6ZTogMTNweDtcXG59XFxuXFxuLmhodi10YWJsZSB0ZCB7XFxuICB0ZXh0LWFsaWduOiBsZWZ0O1xcbiAgcGFkZGluZzogMHB4IDEwcHggMHB4IDJweDtcXG4gIHdoaXRlLXNwYWNlOiBwcmU7XFxuICBmb250LXNpemU6IDEzcHg7XFxufVxcbi5oaHYtdGFibGUgLmhodi1jYXJkLXZhbHVlLFxcbi5oaHYtdGFibGUgLmhodi1jYXJkLXN1aXQge1xcbiAgZm9udC1zaXplOiAxM3B4O1xcbn1cXG5cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCgxKSB7IHdpZHRoOiAxMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoMikgeyB3aWR0aDogMTAwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCgzKSB7IHdpZHRoOiAzMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoNCkgeyB3aWR0aDogMTBweDsgdGV4dC1hbGlnbjogcmlnaHQ7fVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDUpIHsgd2lkdGg6IDEwMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoNikgeyB3aWR0aDogMTAwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCg3KSB7IHdpZHRoOiAxMDBweDsgfVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDgpIHsgd2lkdGg6IDEwMHB4OyB9XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LCBhbGlhczI9aGVscGVycy5oZWxwZXJNaXNzaW5nLCBhbGlhczM9XCJmdW5jdGlvblwiLCBhbGlhczQ9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb247XG5cbiAgcmV0dXJuIFwiICAgIDxsaT5cXG4gICAgICA8aW5wdXQgdHlwZT1cXFwicmFkaW9cXFwiIG5hbWU9XFxcInBsYXllcnNcXFwiIHZhbHVlPVxcXCJcIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubmFtZSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubmFtZSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwibmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCJcXFwiXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pc0hlcm8gOiBkZXB0aDApLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDIsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIi8+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLm5hbWUgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLm5hbWUgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcIm5hbWVcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiXFxuICAgIDwvbGk+XFxuXCI7XG59LFwiMlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiIGNoZWNrZWRcIjtcbn0sXCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImhodi1maWx0ZXItcGxheWVyc1xcXCI+XFxuICA8aDM+UGxheWVyczwvaDM+XFxuICA8dWw+XFxuXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVycy5lYWNoLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucGxheWVycyA6IGRlcHRoMCkse1wibmFtZVwiOlwiZWFjaFwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgIDwvdWw+XFxuPC9kaXY+XFxuPGRpdiBjbGFzcz1cXFwiaGh2LWZpbHRlci1zaG93XFxcIj5cXG4gIDxoMz5TaG93PC9oMz5cXG4gIDx1bD5cXG4gICAgPGxpPjxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwic2hvd1xcXCIgdmFsdWU9XFxcImFsbFxcXCIgY2hlY2tlZC8+QWxsPC9saT5cXG4gICAgPGxpPjxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwic2hvd1xcXCIgdmFsdWU9XFxcImludmVzdGVkXFxcIi8+TW9uZXkgSW52ZXN0ZWQ8L2xpPlxcbiAgICA8bGk+PGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJzaG93XFxcIiB2YWx1ZT1cXFwic2F3RmxvcFxcXCIvPlNhdyBGbG9wPC9saT5cXG4gIDwvdWw+XFxuPC9kaXY+XFxuPGRpdiBjbGFzcz1cXFwiaGh2LWZpbHRlci1kaXNwbGF5XFxcIj5cXG4gIDxoMz5EaXNwbGF5PC9oMz5cXG4gIDx1bD5cXG4gICAgPGxpPjxpbnB1dCB0eXBlPVxcXCJjaGVja2JveFxcXCIgbmFtZT1cXFwiZGlzcGxheVxcXCIgdmFsdWU9XFxcInNlbGVjdFBsYXllclxcXCIvPlNlbGVjdCBQbGF5ZXI8L2xpPlxcbiAgICA8bGk+PGlucHV0IHR5cGU9XFxcImNoZWNrYm94XFxcIiBuYW1lPVxcXCJkaXNwbGF5XFxcIiB2YWx1ZT1cXFwiaW5hY3RpdmVcXFwiLz5JbmFjdGl2ZSBQbGF5ZXJzPC9saT5cXG4gIDwvdWw+XFxuPC9kaXY+XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbmZvXCI6IHtcbiAgICBcInJvb21cIjogXCJwb2tlcnN0YXJzXCIsXG4gICAgXCJoYW5kaWRcIjogXCIxNDk2NTE5OTI1NDhcIixcbiAgICBcImdhbWV0eXBlXCI6IFwidG91cm5hbWVudFwiLFxuICAgIFwiZ2FtZW5vXCI6IFwiMTQ5NTE5MjYzMFwiLFxuICAgIFwiY3VycmVuY3lcIjogXCIkXCIsXG4gICAgXCJkb25hdGlvblwiOiAwLjkxLFxuICAgIFwicmFrZVwiOiAwLjA5LFxuICAgIFwiYnV5aW5cIjogMSxcbiAgICBcInBva2VydHlwZVwiOiBcImhvbGRlbVwiLFxuICAgIFwibGltaXRcIjogXCJub2xpbWl0XCIsXG4gICAgXCJsZXZlbFwiOiBcInhpIFwiLFxuICAgIFwic2JcIjogNDAwLFxuICAgIFwiYmJcIjogODAwLFxuICAgIFwieWVhclwiOiAyMDE2LFxuICAgIFwibW9udGhcIjogMyxcbiAgICBcImRheVwiOiAxLFxuICAgIFwiaG91clwiOiAxLFxuICAgIFwibWluXCI6IDI5LFxuICAgIFwic2VjXCI6IDQxLFxuICAgIFwidGltZXpvbmVcIjogXCJFVFwiLFxuICAgIFwiYW50ZVwiOiA1MCxcbiAgICBcInBsYXllcnNcIjogNCxcbiAgICBcImFueUludmVzdGVkXCI6IHRydWUsXG4gICAgXCJhbnlTYXdGbG9wXCI6IHRydWVcbiAgfSxcbiAgXCJ0YWJsZVwiOiB7XG4gICAgXCJ0YWJsZW5vXCI6IDMsXG4gICAgXCJtYXhzZWF0c1wiOiA5LFxuICAgIFwiYnV0dG9uXCI6IDNcbiAgfSxcbiAgXCJib2FyZFwiOiB7XG4gICAgXCJjYXJkMVwiOiBcIjNjXCIsXG4gICAgXCJjYXJkMlwiOiBcIkpjXCIsXG4gICAgXCJjYXJkM1wiOiBcIjNoXCIsXG4gICAgXCJjYXJkNFwiOiBcIjZoXCIsXG4gICAgXCJjYXJkNVwiOiBcIjNkXCJcbiAgfSxcbiAgXCJwbGF5ZXJzXCI6IFtcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiA0LFxuICAgICAgXCJjaGlwc1wiOiAxNTQ1MSxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDE1MDAxLFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMTUwMDEsXG4gICAgICBcImNoaXBzVHVyblwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAxNTAwMSxcbiAgICAgIFwibVwiOiAxMSxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJmb2xkXCIsXG4gICAgICAgICAgXCJwb3RcIjogNDYwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW10sXG4gICAgICBcInNiXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAyLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc1wiOiBcInNiXCIsXG4gICAgICBcIm5hbWVcIjogXCJEbWVsbG9IXCIsXG4gICAgICBcImludmVzdGVkXCI6IHRydWUsXG4gICAgICBcInNhd0Zsb3BcIjogZmFsc2VcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDksXG4gICAgICBcImNoaXBzXCI6IDIyMDYwLFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMjEyMTAsXG4gICAgICBcImNoaXBzRmxvcFwiOiAyMTIxMCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDIxMjEwLFxuICAgICAgXCJtXCI6IDE2LFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImZvbGRcIixcbiAgICAgICAgICBcInBvdFwiOiA0NjAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwiaGVyb1wiOiB0cnVlLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCI0Y1wiLFxuICAgICAgICBcImNhcmQyXCI6IFwiMmRcIlxuICAgICAgfSxcbiAgICAgIFwiYmJcIjogdHJ1ZSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDMsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zXCI6IFwiYmJcIixcbiAgICAgIFwibmFtZVwiOiBcImhlbGRcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogMSxcbiAgICAgIFwiY2hpcHNcIjogMTU4NzUsXG4gICAgICBcImNoaXBzUHJlZmxvcFwiOiAxNTgyNSxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDE0MjI1LFxuICAgICAgXCJjaGlwc1R1cm5cIjogMTE4MjUsXG4gICAgICBcImNoaXBzUml2ZXJcIjogMTAyMjUsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogNzAyNSxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiA3MDI1LFxuICAgICAgXCJtXCI6IDExLFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcInJhaXNlXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAyLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMTYwMCxcbiAgICAgICAgICBcInBvdFwiOiAxNDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYmV0XCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjUsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAyNDAwLFxuICAgICAgICAgIFwicG90XCI6IDQ2MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwidHVyblwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjaGVja1wiLFxuICAgICAgICAgIFwicG90XCI6IDk0MDBcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMSxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MDAsXG4gICAgICAgICAgXCJwb3RcIjogMTEwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwicml2ZXJcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2hlY2tcIixcbiAgICAgICAgICBcInBvdFwiOiAxMjYwMFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2FsbFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4yLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMzIwMCxcbiAgICAgICAgICBcInBvdFwiOiAxNTgwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zXCI6IFwiY29cIixcbiAgICAgIFwiY2FyZHNcIjoge1xuICAgICAgICBcImNhcmQxXCI6IFwiVGRcIixcbiAgICAgICAgXCJjYXJkMlwiOiBcIlRjXCJcbiAgICAgIH0sXG4gICAgICBcIm5hbWVcIjogXCJGaXNjaGVyc2l0b1wiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IHRydWVcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDMsXG4gICAgICBcImNoaXBzXCI6IDE0MTE0LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMTQwNjQsXG4gICAgICBcImNoaXBzRmxvcFwiOiAxMjQ2NCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDEwMDY0LFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDg0NjQsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogNTI2NCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNDI2NCxcbiAgICAgIFwibVwiOiAxMCxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjUsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAxNjAwLFxuICAgICAgICAgIFwicG90XCI6IDMwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjMsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAyNDAwLFxuICAgICAgICAgIFwicG90XCI6IDcwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwidHVyblwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJiZXRcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMixcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MDAsXG4gICAgICAgICAgXCJwb3RcIjogOTQwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJyaXZlclwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJiZXRcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMyxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDMyMDAsXG4gICAgICAgICAgXCJwb3RcIjogMTI2MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY29sbGVjdFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMSxcbiAgICAgICAgICBcIndpbmFsbFwiOiB0cnVlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE5MDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImJ1dHRvblwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAzLFxuICAgICAgXCJwb3NcIjogXCJidVwiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCJRc1wiLFxuICAgICAgICBcImNhcmQyXCI6IFwiSmhcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIklyaXNoYTJcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiB0cnVlXG4gICAgfVxuICBdXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImluZm9cIjoge1xuICAgIFwicm9vbVwiOiBcInBva2Vyc3RhcnNcIixcbiAgICBcImhhbmRpZFwiOiBcIjE0OTY1MjA1OTQyMlwiLFxuICAgIFwiZ2FtZXR5cGVcIjogXCJ0b3VybmFtZW50XCIsXG4gICAgXCJnYW1lbm9cIjogXCIxNDk1MTkyNjMwXCIsXG4gICAgXCJjdXJyZW5jeVwiOiBcIiRcIixcbiAgICBcImRvbmF0aW9uXCI6IDAuOTEsXG4gICAgXCJyYWtlXCI6IDAuMDksXG4gICAgXCJidXlpblwiOiAxLFxuICAgIFwicG9rZXJ0eXBlXCI6IFwiaG9sZGVtXCIsXG4gICAgXCJsaW1pdFwiOiBcIm5vbGltaXRcIixcbiAgICBcImxldmVsXCI6IFwieGkgXCIsXG4gICAgXCJzYlwiOiA0MDAsXG4gICAgXCJiYlwiOiA4MDAsXG4gICAgXCJ5ZWFyXCI6IDIwMTYsXG4gICAgXCJtb250aFwiOiAzLFxuICAgIFwiZGF5XCI6IDEsXG4gICAgXCJob3VyXCI6IDEsXG4gICAgXCJtaW5cIjogMzMsXG4gICAgXCJzZWNcIjogNTQsXG4gICAgXCJ0aW1lem9uZVwiOiBcIkVUXCIsXG4gICAgXCJhbnRlXCI6IDUwLFxuICAgIFwicGxheWVyc1wiOiA0LFxuICAgIFwiYW55SW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICBcImFueVNhd0Zsb3BcIjogZmFsc2VcbiAgfSxcbiAgXCJ0YWJsZVwiOiB7XG4gICAgXCJ0YWJsZW5vXCI6IDMsXG4gICAgXCJtYXhzZWF0c1wiOiA5LFxuICAgIFwiYnV0dG9uXCI6IDNcbiAgfSxcbiAgXCJib2FyZFwiOiB7XG4gICAgXCJjYXJkMVwiOiBcIjhoXCIsXG4gICAgXCJjYXJkMlwiOiBcIktkXCIsXG4gICAgXCJjYXJkM1wiOiBcIjJzXCIsXG4gICAgXCJjYXJkNFwiOiBcIjZzXCIsXG4gICAgXCJjYXJkNVwiOiBcIjRzXCJcbiAgfSxcbiAgXCJwbGF5ZXJzXCI6IFtcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiA0LFxuICAgICAgXCJjaGlwc1wiOiAzMzMwMixcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDMyODUyLFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMjY4OTMsXG4gICAgICBcImNoaXBzVHVyblwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNjg5MyxcbiAgICAgIFwibVwiOiAyNCxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjYsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAzMDI1LFxuICAgICAgICAgIFwicG90XCI6IDQ4MjVcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMixcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDI5MzQsXG4gICAgICAgICAgXCJwb3RcIjogMTQyMDlcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtdLFxuICAgICAgXCJzYlwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAwLFxuICAgICAgXCJwb3NcIjogXCJzYlwiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCI3aFwiLFxuICAgICAgICBcImNhcmQyXCI6IFwiN2RcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIkRtZWxsb0hcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogOSxcbiAgICAgIFwiY2hpcHNcIjogNjQwOSxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDU1NTksXG4gICAgICBcImNoaXBzRmxvcFwiOiAwLFxuICAgICAgXCJjaGlwc1R1cm5cIjogMCxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAwLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDAsXG4gICAgICBcImNoaXBzQWZ0ZXJcIjogMTYzNDMsXG4gICAgICBcIm1cIjogNSxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJyYWlzZVwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMS45LFxuICAgICAgICAgIFwiYWxsaW5cIjogdHJ1ZSxcbiAgICAgICAgICBcImFtb3VudFwiOiA1NTU5LFxuICAgICAgICAgIFwicG90XCI6IDc4NTBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNvbGxlY3RcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDEsXG4gICAgICAgICAgXCJ3aW5hbGxcIjogdHJ1ZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAxNjM0M1xuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJoZXJvXCI6IHRydWUsXG4gICAgICBcImNhcmRzXCI6IHtcbiAgICAgICAgXCJjYXJkMVwiOiBcIlFkXCIsXG4gICAgICAgIFwiY2FyZDJcIjogXCJRc1wiXG4gICAgICB9LFxuICAgICAgXCJiYlwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMyxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAxLFxuICAgICAgXCJwb3NcIjogXCJiYlwiLFxuICAgICAgXCJuYW1lXCI6IFwiaGVsZFwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiAxLFxuICAgICAgXCJjaGlwc1wiOiAzNDc1LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMzQyNSxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDAsXG4gICAgICBcImNoaXBzVHVyblwiOiAwLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDAsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogMCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAwLFxuICAgICAgXCJtXCI6IDIsXG4gICAgICBcInByZWZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwicmFpc2VcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDQuMyxcbiAgICAgICAgICBcImFsbGluXCI6IHRydWUsXG4gICAgICAgICAgXCJhbW91bnRcIjogMzQyNSxcbiAgICAgICAgICBcInBvdFwiOiAxNDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zXCI6IFwiY29cIixcbiAgICAgIFwiY2FyZHNcIjoge1xuICAgICAgICBcImNhcmQxXCI6IFwiQWRcIixcbiAgICAgICAgXCJjYXJkMlwiOiBcIjJjXCJcbiAgICAgIH0sXG4gICAgICBcIm5hbWVcIjogXCJGaXNjaGVyc2l0b1wiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiAzLFxuICAgICAgXCJjaGlwc1wiOiAyNDMxNCxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDI0MjY0LFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMjQyNjQsXG4gICAgICBcImNoaXBzVHVyblwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNDI2NCxcbiAgICAgIFwibVwiOiAxNyxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJmb2xkXCIsXG4gICAgICAgICAgXCJwb3RcIjogNDgyNVxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW10sXG4gICAgICBcImJ1dHRvblwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAzLFxuICAgICAgXCJwb3NcIjogXCJidVwiLFxuICAgICAgXCJuYW1lXCI6IFwiSXJpc2hhMlwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiBmYWxzZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH1cbiAgXVxufSJdfQ==
