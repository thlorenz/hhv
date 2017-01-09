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

},{"./lib/holdem":2,"./lib/script":3,"./lib/storyboard":4}],2:[function(require,module,exports){
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
  if (!c1 || !c2) return hc
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
  for (let i = 0; i < preflop.length; i++) {
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
  let anyInvested    = false
  let anySawFlop     = false
  for (let i = 0; i < players.length; i++) {
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
    let chips = p[this.prev] - (investeds[k] || 0)
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

module.exports = function analyzeHoldem(hand) {
  let pot = 0
  let currentBet = hand.info.bb

  const playerCount = hand.seats.length
  const startingPot = getStartingPot(hand.info, playerCount)

  const players = {}
  const analyzed = {
      info    : copyValues(hand.info)
    , table   : copyValues(hand.table)
    , board   : copyValues(hand.board)
    , hero    : hand.hero
  }
  analyzed.pots = {
    preflop: startingPot
  }
  analyzed.info.players = playerCount

  for (let i = 0; i < playerCount; i++) {
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

  for (let i = 0; i < hand.posts.length; i++) {
    const p = hand.posts[i]
    const player = players[p.player]
    pot += p.amount
    player.chipsAfter = player.chipsPreflop -= p.amount

    if (p.type === 'sb') player.sb = true
    if (p.type === 'bb') player.bb = true
  }

  function analyzeAction(p, invested, chips) {
    const startingPot = pot
    let cost = 0
    let betDelta = 0
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
      cost = -pot
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

  let investeds = {}
  let chips = {}
  // starting with one bet, first raise is two bet, next three bet and so on
  let bet = 1

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
  for (let i = 0; i < hand.preflop.length; i++) {
    const p = hand.preflop[i]
    const player = players[p.player]
    const invested = investeds[p.player] || startPreflopCost(player)
    if (typeof chips[p.player] === 'undefined') chips[p.player] = player.chipsPreflop

    const info = analyzeAction(p, invested)
    adjustBet(info)

    player.preflop.push(info.action)
    if (!player.hasOwnProperty('preflopOrder')) {
      player.preflopOrder = i
      player.postflopOrder = postFlopOrderFromPreflopOrder(i, playerCount)
      const positions = strategicPositions(i, playerCount)
      player.pos = positions.pos
      player.exactPos = positions.exactPos
    }
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
  for (let i = 0; i < hand.flop.length; i++) {
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
  for (let i = 0; i < hand.turn.length; i++) {
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
  for (let i = 0; i < hand.river.length; i++) {
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
  let collecteds = {}
  for (let i = 0; i < hand.showdown.length; i++) {
    const p = hand.showdown[i]
    const player = players[p.player]
    if (p.type === 'show' || p.type === 'muck') {
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

function addAction(actions, stacks, action, player) {
  actions.push({ action: action, playerIndex: player.index })
}

function addStreet(acc, streetName, ps) {
  const actions = []
  const stacks = []
  let ia = 0
  let keepGoing = true
  while (keepGoing) {
    keepGoing = false
    for (var ip = 0; ip < ps.length; ip++) {
      const p = ps[ip]
      const street = p[streetName]
      const action = street.length > ia && street[ia]
      keepGoing = keepGoing || !!action
      if (action) addAction(actions, stacks, action, p)
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
 * @name hhr::script
 * @function
 * @param {object} data analyzed hand data @see hhr()
 * @return {object}
 */
module.exports = function script(data) {
  const hand = {
      info: data.info
    , table: data.table
    , board: data.board
    , pots: data.pots
    , players: data.players.map(ignoreStreets)
  }
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
 * @name hha:storyboard
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
      info: script.info
    , players: script.players
    , board: script.board
    , states: states
    , streets: streetIdxs
  }
}

},{}],5:[function(require,module,exports){
'use strict'

//            [ exact, range ]
const sb     = [ 'sb', 'sb' ]
const bb     = [ 'bb', 'bb' ]
const bu     = [ 'bu', 'bu' ]
const co     = [ 'co', 'co' ]
const utg    = [ 'utg', 'ea' ]
const utg1   = [ 'utg+1', 'ea' ]
const utg2   = [ 'utg+2', 'ea' ]
const mp1_mi = [ 'mp1', 'mi' ]
const mp2_mi = [ 'mp2', 'mi' ]
const mp1_lt = [ 'mp1', 'lt' ]
const mp2_lt = [ 'mp2', 'lt' ]
const mp3_lt = [ 'mp3', 'lt' ]

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
  , [ utg, utg1, mp1_lt, co, bu, sb, bb ]
    // 8 players
  , [ utg, utg1, utg2, mp1_lt, co, bu, sb, bb ]
    // 9 players
  , [ utg, utg1, utg2, mp1_mi, mp2_lt, co, bu, sb, bb ]
    // 10 players
  , [ utg, utg1, utg2, mp1_mi, mp2_mi, mp3_lt, co, bu, sb, bb ]
]

// Determined  by number of active players at table
// using acting order preflop
module.exports = function strategicPositions(order, activePlayers) {
  const cell = table[activePlayers - 2][order]
  return {
      exactPos: cell[0]
    , pos: cell[1]
  }
}

},{}],6:[function(require,module,exports){
(function (__dirname){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const stringUtil = require('./lib/util/string')

const holdem_ps = require('./lib/holdem/pokerstars')

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
 * @param {object} opts various options
 * @param {boolean} opts.infoOnly denotes that only the header line of the hand is parsed and only the info object returned
 * @return {object} representation of the given hand to be used as input for other tools like hha
 */
exports = module.exports = function parse(input, opts) {
  const lines = Array.isArray(input) ? input : getLines(input).filter(stringUtil.emptyLine)
  if (holdem_ps.canParse(lines)) return holdem_ps.parse(lines, opts)
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
  let hand = []

  let i = 0
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

// Test

function inspect(obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, true))
}

if (!module.parent && typeof window === 'undefined') {
  // const name = 'allin-preflop'
  // const name = 'actiononall'
  const fs = require('fs')
  const path = require('path')
  // const fixtures = path.join(__dirname, 'test', 'fixtures', 'holdem')
  const allhands = fs.readFileSync(path.join(__dirname, 'test', 'fixtures', 'hands.txt'), 'utf8')
  const res = exports.extractHands(allhands)
  inspect(res)
  /* const hha_fixtures = path.join(__dirname, '..', 'hha', 'test', 'fixtures', 'holdem')
  const txt = fs.readFileSync(path.join(fixtures, 'pokerstars', name + '.txt'), 'utf8')

  const res = module.exports(txt)
  inspect(res)
  fs.writeFileSync(path.join(hha_fixtures, name + '.json'),
                   JSON.stringify(res, null, 2),
                   'utf8')*/
}

}).call(this,"/node_modules/hhp")

},{"./lib/holdem/pokerstars":8,"./lib/util/string":9,"fs":17,"path":19,"util":22}],7:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const stringUtil     = require('../util/string')
const safeParseInt   = stringUtil.safeParseInt
const safeParseFloat = stringUtil.safeParseFloat
const safeTrim       = stringUtil.safeTrim
const safeLower      = stringUtil.safeLower
const safeUpper      = stringUtil.safeUpper
const safeFirstUpper = stringUtil.safeFirstUpper

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
  }
}

var proto = HandHistoryParser.prototype
proto._gameType            = undefined
proto._handInfoRx          = undefined
proto._tableInfoRx         = undefined
proto._seatInfoRx          = undefined
proto._postRx              = undefined
proto._preflopIndicatorRx  = undefined
proto._streetIndicatorRx   = undefined
proto._showdownIndicatorRx = undefined
proto._summaryIndicatorRx  = undefined
proto._holecardsRx         = undefined
proto._actionRx            = undefined
proto._collectRx           = undefined
proto._betReturnedRx       = undefined
proto._showRx              = undefined
proto._boardRx             = undefined
proto._muckRx              = undefined

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

proto._readInfo = function _readInfo(line, lineno) {
  const gameType   = this._gameType()
  const handInfo   = this._handInfoRx(gameType)
  const handInfoRx = handInfo.rx
  const idxs       = handInfo.idxs
  const match      = line.match(handInfoRx)
  if (!match) return

  this.hand.info = {
      room      : safeLower(match[idxs.room])
    , handid    : match[idxs.handid]
    , gametype  : gameType
    , currency  : match[idxs.currency]
    , pokertype : this._identifyPokerType(match[idxs.pokertype])
    , limit     : this._identifyLimit(match[idxs.limit])
    , sb        : safeParseFloat(match[idxs.sb])
    , bb        : safeParseFloat(match[idxs.bb])
    , year      : safeParseInt(match[idxs.year])
    , month     : safeParseInt(match[idxs.month])
    , day       : safeParseInt(match[idxs.day])
    , hour      : safeParseInt(match[idxs.hour])
    , min       : safeParseInt(match[idxs.min])
    , sec       : safeParseInt(match[idxs.sec])
    , timezone  : safeUpper(match[idxs.timezone])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }

  if (idxs.donation && idxs.rake) {
    const donation = safeParseFloat(match[idxs.donation])
    const rake     = safeParseFloat(match[idxs.rake])

    this.hand.info.donation  = safeParseFloat(donation)
    this.hand.info.rake      = safeParseFloat(rake)
    this.hand.info.buyin     = donation + rake
  }
  if (idxs.gameno) {
    this.hand.info.gameno = match[idxs.gameno]
  }

  if (idxs.level) {
    this.hand.info.level = safeLower(match[idxs.level])
  }

  return true
}

proto._readTable = function _readTable(line, lineno) {
  const gameType = this._gameType()
  const table    = this._tableRx(gameType)
  const tableRx  = table.rx
  const idxs     = table.idxs
  const match    = line.match(tableRx)
  if (!match) return

  const tableno  = gameType === 'tournament'
    ? safeParseInt(match[idxs.tableno])
    : match[idxs.tableno]
  this.hand.table = {
      tableno  : tableno
    , maxseats : safeParseInt(match[idxs.maxseats])
    , button   : safeParseInt(match[idxs.button])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  return true
}

proto._readSeat = function _readSeat(line, lineno) {
  const match = line.match(this._seatInfoRx)
  if (!match) return

  this.hand.seats.push({
      seatno: safeParseInt(match[1])
    , player: match[2].trim()
    , chips: safeParseFloat(match[3])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  })
  return true
}

proto._postType = function _postType(s) {
  return  s === 'ante' ?  'ante'
        : s === 'big blind' ? 'bb'
        : s === 'small blind' ? 'sb'
        : 'unknown'
}

proto._readPost = function _readPost(line, lineno) {
  const match = line.match(this._postRx)
  if (!match) return

  const type   = this._postType(match[2])
  const amount = safeParseFloat(match[3])

  this.hand.posts.push({
      player: match[1]
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

proto._readHoleCards = function _readHoleCards(line, lineno) {
  const match = line.match(this._holecardsRx)
  if (!match) return

  this.hand.hero = match[1]
  this.hand.holecards = {
      card1: safeFirstUpper(safeTrim(match[2]))
    , card2: safeFirstUpper(safeTrim(match[3]))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
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

proto._readShow =  function _readShow(line, lineno) {
  const match = line.match(this._showRx)
  if (!match) return

  const action = {
      player  : match[1]
    , type    : 'show'
    , card1   : safeFirstUpper(safeTrim(match[2]))
    , card2   : safeFirstUpper(safeTrim(match[3]))
    , desc    : match[4]
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  this.hand.showdown.push(action)

  return true
}

proto._readMuck = function _readMuck(line, lineno) {
  const match = line.match(this._muckRx)
  if (!match) return

  const action = {
      player : match[1]
    , type   : 'muck'
    , card1  : safeFirstUpper(safeTrim(match[2]))
    , card2  : safeFirstUpper(safeTrim(match[3]))
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  this.hand.showdown.push(action)
}

proto._readBoard = function _readBoard(line, lineno) {
  const match = line.match(this._boardRx)
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

function actionType(s) {
  return s.replace(/(ed|s)$/, '')
}

proto._readAction = function _readAction(line, lineno) {
  if (this._readBetReturned(line, lineno)) return true

  const match = line.match(this._actionRx) || line.match(this._collectRx)
  if (!match) return false

  const type = actionType(match[2])
  const action = {
      player  : match[1]
    , type    : type
    , amount  : safeParseFloat(match[3])
  }
  if (type === 'raise') {
    action.raiseTo = safeParseFloat(match[4])
    action.allin = !!match[5]
  } else if (type === 'call' || type === 'bet') {
    action.allin = !!match[5]
  }

  action.metadata = {
      lineno: lineno
    , raw: line
  }

  this._addAction(action, line, lineno)
  return true
}

proto._readBetReturned = function _readBetReturned(line, lineno) {
  const match = line.match(this._betReturnedRx)
  if (!match) return false

  const action = {
      player  : match[2]
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
  for (let i = 0; i < lines.length; i++) {
    if (this._sawSummary) {
      if (this._readBoard(lines[i], i)) continue
      if (this._readMuck(lines[i], i)) continue
    } else {
      this._sawSummary = this._summaryIndicator(lines[i], i)
      if (this._sawSummary) continue
    }

    if (this._sawShowdown) {
      if (this._readShow(lines[i], i)) continue
    } else {
      this._sawShowdown = this._showdownIndicator(lines[i], i)
      if (this._sawShowdown) continue
    }

    if (this._sawPreflop) {
      if (!this._sawFlop && !this.hand.holecards) {
        if (this._readHoleCards(lines[i], i)) {
          this._sawPreflop = true
          continue
        }
      }
      if (this._readStreet(lines[i], i)) continue
      if (this._readAction(lines[i], i)) continue
    } else {
      this._sawPreflop = this._preflopIndicator(lines[i], i)
      if (this._sawPreflop) continue
      if (this._readPost(lines[i], i)) {
        this._posted = true
        continue
      }
    }

    if (!this._posted) {
      if (!this.hand.info) {
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

},{"../util/string":9}],8:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

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
  '[^\\d]*([^:]+):([^:]+):([^ ]+) (.+)'

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

proto._seatInfoRx          = /^Seat (\d+): ([^(]+)\([$|€]?([^ ]+) in chips\)( .+sitting out)?$/i
proto._postRx              = /^([^:]+): posts (?:the )?(ante|small blind|big blind) [$|€]?([^ ]+)$/i
proto._preflopIndicatorRx  = /^\*\*\* HOLE CARDS \*\*\*$/
proto._streetIndicatorRx   = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*[^[]+\[(..) (..) (..)(?: (..))?](?: \[(..)])?$/
proto._showdownIndicatorRx = /^\*\*\* SHOW DOWN \*\*\*$/
proto._summaryIndicatorRx  = /^\*\*\* SUMMARY \*\*\*$/
proto._holecardsRx         = /^Dealt to ([^[]+) \[(..) (..)]$/i
proto._actionRx            = /^([^:]+): (raises|bets|calls|checks|folds) ?[$|€]?([^ ]+)?(?: to [$|€]?([^ ]+))?(.+all-in)?$/i
proto._collectRx           = /^(.+) (collected) [$|€]?([^ ]+) from.+pot$/i
proto._showRx              = /^([^:]+): shows \[(..) (..)] \(([^)]+)\)$/i
proto._boardRx             = /^Board \[(..)?( ..)?( ..)?( ..)?( ..)?]$/i
proto._muckRx              = /^Seat \d+: (.+) mucked \[(..) (..)]$/i
proto._betReturnedRx       = /^uncalled bet [(]?[$|€]?([^ )]+)[)]? returned to (.+)$/i

proto._gameType = function _gameType() {
  if (this._cachedGameType) return this._cachedGameType
  const lines = this._lines
  for (let i = 0; i < lines.length && lines[i].length; i++) {
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

exports.canParse = function canParse(lines) {
  return new HoldemPokerStarsParser(lines).canParse()
}

exports.parse = function parse(lines, infoOnly) {
  return new HoldemPokerStarsParser(lines, infoOnly).parse()
}

},{"./base":7}],9:[function(require,module,exports){
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
  return typeof s === 'undefined'
    ? undefined
    : parseFloat(s)
}

},{}],10:[function(require,module,exports){
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
function addPlayer (k) { players[k] = true }
function render (h) {
  const info = hhv.render(h)
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
  const sorted = hhv.sortByDateTime(analyzed)
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

},{"../hhv":12,"./sample":11,"hha":1,"hhp":6}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

exports.render = function render (analyzed) {
  const prepared = prepareRender(analyzed)
  return {
      html: holdem(prepared.info)
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

},{"./lib/inject-style":15,"./lib/sort":16,"./lib/templates":13,"./test/fixtures/holdem/actiononall.json":49,"./test/fixtures/holdem/allin-preflop.json":50,"fs":17,"path":19,"util":22}],13:[function(require,module,exports){
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

},{"../templates/head.hbs":43,"../templates/holdem.hbs":44,"../templates/style-filter.hbs":45,"../templates/style-select-player.hbs":46,"../templates/style.hbs":47,"../templates/ui-filter.hbs":48,"./helpers":14,"hbsfy/runtime":42}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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

exports.byDateTime = function sortByDateTime (analyzed) {
  return analyzed.sort(byDateTime)
}


},{}],17:[function(require,module,exports){

},{}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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

},{"_process":20}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],22:[function(require,module,exports){
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

},{"./support/isBuffer":21,"_process":20,"inherits":18}],23:[function(require,module,exports){
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


},{"./handlebars/base":24,"./handlebars/exception":27,"./handlebars/no-conflict":37,"./handlebars/runtime":38,"./handlebars/safe-string":39,"./handlebars/utils":40}],24:[function(require,module,exports){
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


},{"./decorators":25,"./exception":27,"./helpers":28,"./logger":36,"./utils":40}],25:[function(require,module,exports){
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


},{"./decorators/inline":26}],26:[function(require,module,exports){
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


},{"../utils":40}],27:[function(require,module,exports){
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


},{}],28:[function(require,module,exports){
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


},{"./helpers/block-helper-missing":29,"./helpers/each":30,"./helpers/helper-missing":31,"./helpers/if":32,"./helpers/log":33,"./helpers/lookup":34,"./helpers/with":35}],29:[function(require,module,exports){
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


},{"../utils":40}],30:[function(require,module,exports){
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


},{"../exception":27,"../utils":40}],31:[function(require,module,exports){
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


},{"../exception":27}],32:[function(require,module,exports){
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


},{"../utils":40}],33:[function(require,module,exports){
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


},{}],34:[function(require,module,exports){
'use strict';

exports.__esModule = true;

exports['default'] = function (instance) {
  instance.registerHelper('lookup', function (obj, field) {
    return obj && obj[field];
  });
};

module.exports = exports['default'];


},{}],35:[function(require,module,exports){
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


},{"../utils":40}],36:[function(require,module,exports){
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


},{"./utils":40}],37:[function(require,module,exports){
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

},{}],38:[function(require,module,exports){
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


},{"./base":24,"./exception":27,"./utils":40}],39:[function(require,module,exports){
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


},{}],40:[function(require,module,exports){
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


},{}],41:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime')['default'];

},{"./dist/cjs/handlebars.runtime":23}],42:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":41}],43:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper;

  return "<head>\n  <meta charset=\"utf-8\">\n  <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Inconsolata\">\n  <style type=\"text/css\">"
    + ((stack1 = ((helper = (helper = helpers.css || (depth0 != null ? depth0.css : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : {},{"name":"css","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</style>\n</head>\n";
},"useData":true});

},{"hbsfy/runtime":42}],44:[function(require,module,exports){
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

},{"hbsfy/runtime":42}],45:[function(require,module,exports){
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

},{"hbsfy/runtime":42}],46:[function(require,module,exports){
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

},{"hbsfy/runtime":42}],47:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return ".hhv-hand {\n  width: 700px;\n  background: #333;\n  border: 1px solid #333;\n  border-radius: 6px 6px 0 0;\n  box-shadow: 6px 6px 12px #888;\n  margin: 0 0 10px 0;\n}\n.hhv-header {\n  color: yellowgreen;\n  height: 20px;\n  padding: 2px;\n  font-family: monospace;\n}\n.hhv-board {\n  background: antiquewhite;\n  border-radius: 3px;\n  height: 20px;\n  color: black;\n  padding: 1px 0px 1px 2px;\n  margin-right: 3px;\n  min-width: 60px;\n}\n.hhv-card-value,\n.hhv-card-suit {\n  font-family: verdana;\n  font-size: 13px;\n}\n.hhv-card-suit {\n  margin-right: 2px;\n  font-size: 15px;\n}\n.hhv-card-suit.s,\n.hhv-card-suit.c {\n  color: black;\n}\n.hhv-card-suit.d,\n.hhv-card-suit.h {\n  color: red;\n}\n.hhv-table {\n  background: white;\n  font-family: Inconsolata, monospace;\n}\n.hhv-table table {\n  border-spacing: 0;\n}\n\n.hhv-table th {\n  text-align: left;\n  font-size: 13px;\n}\n\n.hhv-table td {\n  text-align: left;\n  padding: 0px 10px 0px 2px;\n  white-space: pre;\n  font-size: 13px;\n}\n.hhv-table .hhv-card-value,\n.hhv-table .hhv-card-suit {\n  font-size: 13px;\n}\n\n.hhv-table td:nth-child(1) { width: 10px; }\n.hhv-table td:nth-child(2) { width: 100px; }\n.hhv-table td:nth-child(3) { width: 30px; }\n.hhv-table td:nth-child(4) { width: 10px; text-align: right;}\n.hhv-table td:nth-child(5) { width: 100px; }\n.hhv-table td:nth-child(6) { width: 100px; }\n.hhv-table td:nth-child(7) { width: 100px; }\n.hhv-table td:nth-child(8) { width: 100px; }\n";
},"useData":true});

},{"hbsfy/runtime":42}],48:[function(require,module,exports){
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

},{"hbsfy/runtime":42}],49:[function(require,module,exports){
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
},{}],50:[function(require,module,exports){
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
},{}]},{},[10])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9oaGEvaGhhLmpzIiwiLi4vaGhhL2xpYi9ob2xkZW0uanMiLCIuLi9oaGEvbGliL3NjcmlwdC5qcyIsIi4uL2hoYS9saWIvc3Rvcnlib2FyZC5qcyIsIi4uL2hoYS9saWIvc3RyYXRlZ2ljLXBvc2l0aW9ucy5qcyIsIi4uL2hocC9ub2RlX21vZHVsZXMvaGhwL2hocC5qcyIsIi4uL2hocC9saWIvaG9sZGVtL2Jhc2UuanMiLCIuLi9oaHAvbGliL2hvbGRlbS9wb2tlcnN0YXJzLmpzIiwiLi4vaGhwL2xpYi91dGlsL3N0cmluZy5qcyIsImNsaWVudC9tYWluLmpzIiwiY2xpZW50L3NhbXBsZS5qcyIsImhodi5qcyIsImxpYi9icm93c2VyLXRlbXBsYXRlcy5qcyIsImxpYi9oZWxwZXJzLmpzIiwibGliL2luamVjdC1zdHlsZS5qcyIsImxpYi9zb3J0LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy5ydW50aW1lLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvYmFzZS5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2RlY29yYXRvcnMuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9kZWNvcmF0b3JzL2lubGluZS5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2V4Y2VwdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2Jsb2NrLWhlbHBlci1taXNzaW5nLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9lYWNoLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9oZWxwZXItbWlzc2luZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvaWYuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2xvZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvbG9va3VwLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy93aXRoLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvbG9nZ2VyLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvZGlzdC9janMvaGFuZGxlYmFycy9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9uby1jb25mbGljdC5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL3J1bnRpbWUuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9zYWZlLXN0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL3V0aWxzLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIm5vZGVfbW9kdWxlcy9oYnNmeS9ydW50aW1lLmpzIiwidGVtcGxhdGVzL2hlYWQuaGJzIiwidGVtcGxhdGVzL2hvbGRlbS5oYnMiLCJ0ZW1wbGF0ZXMvc3R5bGUtZmlsdGVyLmhicyIsInRlbXBsYXRlcy9zdHlsZS1zZWxlY3QtcGxheWVyLmhicyIsInRlbXBsYXRlcy9zdHlsZS5oYnMiLCJ0ZW1wbGF0ZXMvdWktZmlsdGVyLmhicyIsInRlc3QvZml4dHVyZXMvaG9sZGVtL2FjdGlvbm9uYWxsLmpzb24iLCJ0ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hbGxpbi1wcmVmbG9wLmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7OzhCQzFrQnNCLG1CQUFtQjs7SUFBN0IsSUFBSTs7Ozs7b0NBSU8sMEJBQTBCOzs7O21DQUMzQix3QkFBd0I7Ozs7K0JBQ3ZCLG9CQUFvQjs7SUFBL0IsS0FBSzs7aUNBQ1Esc0JBQXNCOztJQUFuQyxPQUFPOztvQ0FFSSwwQkFBMEI7Ozs7O0FBR2pELFNBQVMsTUFBTSxHQUFHO0FBQ2hCLE1BQUksRUFBRSxHQUFHLElBQUksSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7O0FBRTFDLE9BQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3ZCLElBQUUsQ0FBQyxVQUFVLG9DQUFhLENBQUM7QUFDM0IsSUFBRSxDQUFDLFNBQVMsbUNBQVksQ0FBQztBQUN6QixJQUFFLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztBQUNqQixJQUFFLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDOztBQUU3QyxJQUFFLENBQUMsRUFBRSxHQUFHLE9BQU8sQ0FBQztBQUNoQixJQUFFLENBQUMsUUFBUSxHQUFHLFVBQVMsSUFBSSxFQUFFO0FBQzNCLFdBQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7R0FDbkMsQ0FBQzs7QUFFRixTQUFPLEVBQUUsQ0FBQztDQUNYOztBQUVELElBQUksSUFBSSxHQUFHLE1BQU0sRUFBRSxDQUFDO0FBQ3BCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDOztBQUVyQixrQ0FBVyxJQUFJLENBQUMsQ0FBQzs7QUFFakIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQzs7cUJBRVIsSUFBSTs7Ozs7Ozs7Ozs7OztxQkNwQ3lCLFNBQVM7O3lCQUMvQixhQUFhOzs7O3VCQUNFLFdBQVc7OzBCQUNSLGNBQWM7O3NCQUNuQyxVQUFVOzs7O0FBRXRCLElBQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQzs7QUFDeEIsSUFBTSxpQkFBaUIsR0FBRyxDQUFDLENBQUM7OztBQUU1QixJQUFNLGdCQUFnQixHQUFHO0FBQzlCLEdBQUMsRUFBRSxhQUFhO0FBQ2hCLEdBQUMsRUFBRSxlQUFlO0FBQ2xCLEdBQUMsRUFBRSxlQUFlO0FBQ2xCLEdBQUMsRUFBRSxVQUFVO0FBQ2IsR0FBQyxFQUFFLGtCQUFrQjtBQUNyQixHQUFDLEVBQUUsaUJBQWlCO0FBQ3BCLEdBQUMsRUFBRSxVQUFVO0NBQ2QsQ0FBQzs7O0FBRUYsSUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUM7O0FBRTlCLFNBQVMscUJBQXFCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUU7QUFDbkUsTUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLElBQUksRUFBRSxDQUFDO0FBQzdCLE1BQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxJQUFJLEVBQUUsQ0FBQztBQUMvQixNQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsSUFBSSxFQUFFLENBQUM7O0FBRW5DLGtDQUF1QixJQUFJLENBQUMsQ0FBQztBQUM3Qix3Q0FBMEIsSUFBSSxDQUFDLENBQUM7Q0FDakM7O0FBRUQscUJBQXFCLENBQUMsU0FBUyxHQUFHO0FBQ2hDLGFBQVcsRUFBRSxxQkFBcUI7O0FBRWxDLFFBQU0scUJBQVE7QUFDZCxLQUFHLEVBQUUsb0JBQU8sR0FBRzs7QUFFZixnQkFBYyxFQUFFLHdCQUFTLElBQUksRUFBRSxFQUFFLEVBQUU7QUFDakMsUUFBSSxnQkFBUyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssVUFBVSxFQUFFO0FBQ3RDLFVBQUksRUFBRSxFQUFFO0FBQUUsY0FBTSwyQkFBYyx5Q0FBeUMsQ0FBQyxDQUFDO09BQUU7QUFDM0Usb0JBQU8sSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztLQUM1QixNQUFNO0FBQ0wsVUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7S0FDekI7R0FDRjtBQUNELGtCQUFnQixFQUFFLDBCQUFTLElBQUksRUFBRTtBQUMvQixXQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7R0FDM0I7O0FBRUQsaUJBQWUsRUFBRSx5QkFBUyxJQUFJLEVBQUUsT0FBTyxFQUFFO0FBQ3ZDLFFBQUksZ0JBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLFVBQVUsRUFBRTtBQUN0QyxvQkFBTyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0tBQzdCLE1BQU07QUFDTCxVQUFJLE9BQU8sT0FBTyxLQUFLLFdBQVcsRUFBRTtBQUNsQyxjQUFNLHlFQUEwRCxJQUFJLG9CQUFpQixDQUFDO09BQ3ZGO0FBQ0QsVUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLENBQUM7S0FDL0I7R0FDRjtBQUNELG1CQUFpQixFQUFFLDJCQUFTLElBQUksRUFBRTtBQUNoQyxXQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7R0FDNUI7O0FBRUQsbUJBQWlCLEVBQUUsMkJBQVMsSUFBSSxFQUFFLEVBQUUsRUFBRTtBQUNwQyxRQUFJLGdCQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxVQUFVLEVBQUU7QUFDdEMsVUFBSSxFQUFFLEVBQUU7QUFBRSxjQUFNLDJCQUFjLDRDQUE0QyxDQUFDLENBQUM7T0FBRTtBQUM5RSxvQkFBTyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO0tBQy9CLE1BQU07QUFDTCxVQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztLQUM1QjtHQUNGO0FBQ0QscUJBQW1CLEVBQUUsNkJBQVMsSUFBSSxFQUFFO0FBQ2xDLFdBQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztHQUM5QjtDQUNGLENBQUM7O0FBRUssSUFBSSxHQUFHLEdBQUcsb0JBQU8sR0FBRyxDQUFDOzs7UUFFcEIsV0FBVztRQUFFLE1BQU07Ozs7Ozs7Ozs7OztnQ0M3RUEscUJBQXFCOzs7O0FBRXpDLFNBQVMseUJBQXlCLENBQUMsUUFBUSxFQUFFO0FBQ2xELGdDQUFlLFFBQVEsQ0FBQyxDQUFDO0NBQzFCOzs7Ozs7OztxQkNKb0IsVUFBVTs7cUJBRWhCLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsVUFBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUU7QUFDM0UsUUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2IsUUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUU7QUFDbkIsV0FBSyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7QUFDcEIsU0FBRyxHQUFHLFVBQVMsT0FBTyxFQUFFLE9BQU8sRUFBRTs7QUFFL0IsWUFBSSxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQztBQUNsQyxpQkFBUyxDQUFDLFFBQVEsR0FBRyxjQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQzFELFlBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDL0IsaUJBQVMsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0FBQzlCLGVBQU8sR0FBRyxDQUFDO09BQ1osQ0FBQztLQUNIOztBQUVELFNBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7O0FBRTdDLFdBQU8sR0FBRyxDQUFDO0dBQ1osQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7QUNwQkQsSUFBTSxVQUFVLEdBQUcsQ0FBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQzs7QUFFbkcsU0FBUyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRTtBQUNoQyxNQUFJLEdBQUcsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLEdBQUc7TUFDdEIsSUFBSSxZQUFBO01BQ0osTUFBTSxZQUFBLENBQUM7QUFDWCxNQUFJLEdBQUcsRUFBRTtBQUNQLFFBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztBQUN0QixVQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7O0FBRTFCLFdBQU8sSUFBSSxLQUFLLEdBQUcsSUFBSSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUM7R0FDeEM7O0FBRUQsTUFBSSxHQUFHLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQzs7O0FBRzFELE9BQUssSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxFQUFFO0FBQ2hELFFBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDOUM7OztBQUdELE1BQUksS0FBSyxDQUFDLGlCQUFpQixFQUFFO0FBQzNCLFNBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7R0FDMUM7O0FBRUQsTUFBSSxHQUFHLEVBQUU7QUFDUCxRQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztBQUN2QixRQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztHQUN0QjtDQUNGOztBQUVELFNBQVMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQzs7cUJBRW5CLFNBQVM7Ozs7Ozs7Ozs7Ozs7eUNDbENlLGdDQUFnQzs7OzsyQkFDOUMsZ0JBQWdCOzs7O29DQUNQLDBCQUEwQjs7Ozt5QkFDckMsY0FBYzs7OzswQkFDYixlQUFlOzs7OzZCQUNaLGtCQUFrQjs7OzsyQkFDcEIsZ0JBQWdCOzs7O0FBRWxDLFNBQVMsc0JBQXNCLENBQUMsUUFBUSxFQUFFO0FBQy9DLHlDQUEyQixRQUFRLENBQUMsQ0FBQztBQUNyQywyQkFBYSxRQUFRLENBQUMsQ0FBQztBQUN2QixvQ0FBc0IsUUFBUSxDQUFDLENBQUM7QUFDaEMseUJBQVcsUUFBUSxDQUFDLENBQUM7QUFDckIsMEJBQVksUUFBUSxDQUFDLENBQUM7QUFDdEIsNkJBQWUsUUFBUSxDQUFDLENBQUM7QUFDekIsMkJBQWEsUUFBUSxDQUFDLENBQUM7Q0FDeEI7Ozs7Ozs7O3FCQ2hCcUQsVUFBVTs7cUJBRWpELFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsVUFBUyxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQ3ZFLFFBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPO1FBQ3pCLEVBQUUsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDOztBQUVwQixRQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUU7QUFDcEIsYUFBTyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDakIsTUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLElBQUksT0FBTyxJQUFJLElBQUksRUFBRTtBQUMvQyxhQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUN0QixNQUFNLElBQUksZUFBUSxPQUFPLENBQUMsRUFBRTtBQUMzQixVQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ3RCLFlBQUksT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUNmLGlCQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQzlCOztBQUVELGVBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO09BQ2hELE1BQU07QUFDTCxlQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztPQUN0QjtLQUNGLE1BQU07QUFDTCxVQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUMvQixZQUFJLElBQUksR0FBRyxtQkFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDckMsWUFBSSxDQUFDLFdBQVcsR0FBRyx5QkFBa0IsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzdFLGVBQU8sR0FBRyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUMsQ0FBQztPQUN4Qjs7QUFFRCxhQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7S0FDN0I7R0FDRixDQUFDLENBQUM7Q0FDSjs7Ozs7Ozs7Ozs7OztxQkMvQjhFLFVBQVU7O3lCQUNuRSxjQUFjOzs7O3FCQUVyQixVQUFTLFFBQVEsRUFBRTtBQUNoQyxVQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxVQUFTLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDekQsUUFBSSxDQUFDLE9BQU8sRUFBRTtBQUNaLFlBQU0sMkJBQWMsNkJBQTZCLENBQUMsQ0FBQztLQUNwRDs7QUFFRCxRQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsRUFBRTtRQUNmLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTztRQUN6QixDQUFDLEdBQUcsQ0FBQztRQUNMLEdBQUcsR0FBRyxFQUFFO1FBQ1IsSUFBSSxZQUFBO1FBQ0osV0FBVyxZQUFBLENBQUM7O0FBRWhCLFFBQUksT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQy9CLGlCQUFXLEdBQUcseUJBQWtCLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7S0FDakY7O0FBRUQsUUFBSSxrQkFBVyxPQUFPLENBQUMsRUFBRTtBQUFFLGFBQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQUU7O0FBRTFELFFBQUksT0FBTyxDQUFDLElBQUksRUFBRTtBQUNoQixVQUFJLEdBQUcsbUJBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2xDOztBQUVELGFBQVMsYUFBYSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO0FBQ3pDLFVBQUksSUFBSSxFQUFFO0FBQ1IsWUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUM7QUFDakIsWUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7QUFDbkIsWUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQ3pCLFlBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQzs7QUFFbkIsWUFBSSxXQUFXLEVBQUU7QUFDZixjQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsR0FBRyxLQUFLLENBQUM7U0FDeEM7T0FDRjs7QUFFRCxTQUFHLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7QUFDN0IsWUFBSSxFQUFFLElBQUk7QUFDVixtQkFBVyxFQUFFLG1CQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsV0FBVyxHQUFHLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztPQUMvRSxDQUFDLENBQUM7S0FDSjs7QUFFRCxRQUFJLE9BQU8sSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUU7QUFDMUMsVUFBSSxlQUFRLE9BQU8sQ0FBQyxFQUFFO0FBQ3BCLGFBQUssSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ3ZDLGNBQUksQ0FBQyxJQUFJLE9BQU8sRUFBRTtBQUNoQix5QkFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7V0FDL0M7U0FDRjtPQUNGLE1BQU07QUFDTCxZQUFJLFFBQVEsWUFBQSxDQUFDOztBQUViLGFBQUssSUFBSSxHQUFHLElBQUksT0FBTyxFQUFFO0FBQ3ZCLGNBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRTs7OztBQUkvQixnQkFBSSxRQUFRLEtBQUssU0FBUyxFQUFFO0FBQzFCLDJCQUFhLENBQUMsUUFBUSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzthQUNoQztBQUNELG9CQUFRLEdBQUcsR0FBRyxDQUFDO0FBQ2YsYUFBQyxFQUFFLENBQUM7V0FDTDtTQUNGO0FBQ0QsWUFBSSxRQUFRLEtBQUssU0FBUyxFQUFFO0FBQzFCLHVCQUFhLENBQUMsUUFBUSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDdEM7T0FDRjtLQUNGOztBQUVELFFBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUNYLFNBQUcsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDckI7O0FBRUQsV0FBTyxHQUFHLENBQUM7R0FDWixDQUFDLENBQUM7Q0FDSjs7Ozs7Ozs7Ozs7Ozt5QkM5RXFCLGNBQWM7Ozs7cUJBRXJCLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsZUFBZSxFQUFFLGlDQUFnQztBQUN2RSxRQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFOztBQUUxQixhQUFPLFNBQVMsQ0FBQztLQUNsQixNQUFNOztBQUVMLFlBQU0sMkJBQWMsbUJBQW1CLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ3ZGO0dBQ0YsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7cUJDWmlDLFVBQVU7O3FCQUU3QixVQUFTLFFBQVEsRUFBRTtBQUNoQyxVQUFRLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxVQUFTLFdBQVcsRUFBRSxPQUFPLEVBQUU7QUFDM0QsUUFBSSxrQkFBVyxXQUFXLENBQUMsRUFBRTtBQUFFLGlCQUFXLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUFFOzs7OztBQUt0RSxRQUFJLEFBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLFdBQVcsSUFBSyxlQUFRLFdBQVcsQ0FBQyxFQUFFO0FBQ3ZFLGFBQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUM5QixNQUFNO0FBQ0wsYUFBTyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3pCO0dBQ0YsQ0FBQyxDQUFDOztBQUVILFVBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLFVBQVMsV0FBVyxFQUFFLE9BQU8sRUFBRTtBQUMvRCxXQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBQyxDQUFDLENBQUM7R0FDdkgsQ0FBQyxDQUFDO0NBQ0o7Ozs7Ozs7Ozs7cUJDbkJjLFVBQVMsUUFBUSxFQUFFO0FBQ2hDLFVBQVEsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLGtDQUFpQztBQUM5RCxRQUFJLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQztRQUNsQixPQUFPLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDOUMsU0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzdDLFVBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDekI7O0FBRUQsUUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQ2QsUUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLEVBQUU7QUFDOUIsV0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO0tBQzVCLE1BQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksRUFBRTtBQUNyRCxXQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7S0FDNUI7QUFDRCxRQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDOztBQUVoQixZQUFRLENBQUMsR0FBRyxNQUFBLENBQVosUUFBUSxFQUFTLElBQUksQ0FBQyxDQUFDO0dBQ3hCLENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7O3FCQ2xCYyxVQUFTLFFBQVEsRUFBRTtBQUNoQyxVQUFRLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxVQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDckQsV0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0dBQzFCLENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7O3FCQ0o4RSxVQUFVOztxQkFFMUUsVUFBUyxRQUFRLEVBQUU7QUFDaEMsVUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsVUFBUyxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQ3pELFFBQUksa0JBQVcsT0FBTyxDQUFDLEVBQUU7QUFBRSxhQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUFFOztBQUUxRCxRQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDOztBQUVwQixRQUFJLENBQUMsZUFBUSxPQUFPLENBQUMsRUFBRTtBQUNyQixVQUFJLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3hCLFVBQUksT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO0FBQy9CLFlBQUksR0FBRyxtQkFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakMsWUFBSSxDQUFDLFdBQVcsR0FBRyx5QkFBa0IsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO09BQ2hGOztBQUVELGFBQU8sRUFBRSxDQUFDLE9BQU8sRUFBRTtBQUNqQixZQUFJLEVBQUUsSUFBSTtBQUNWLG1CQUFXLEVBQUUsbUJBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7T0FDaEUsQ0FBQyxDQUFDO0tBQ0osTUFBTTtBQUNMLGFBQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUM5QjtHQUNGLENBQUMsQ0FBQztDQUNKOzs7Ozs7Ozs7O3FCQ3ZCcUIsU0FBUzs7QUFFL0IsSUFBSSxNQUFNLEdBQUc7QUFDWCxXQUFTLEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUM7QUFDN0MsT0FBSyxFQUFFLE1BQU07OztBQUdiLGFBQVcsRUFBRSxxQkFBUyxLQUFLLEVBQUU7QUFDM0IsUUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUU7QUFDN0IsVUFBSSxRQUFRLEdBQUcsZUFBUSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBQzlELFVBQUksUUFBUSxJQUFJLENBQUMsRUFBRTtBQUNqQixhQUFLLEdBQUcsUUFBUSxDQUFDO09BQ2xCLE1BQU07QUFDTCxhQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztPQUM3QjtLQUNGOztBQUVELFdBQU8sS0FBSyxDQUFDO0dBQ2Q7OztBQUdELEtBQUcsRUFBRSxhQUFTLEtBQUssRUFBYztBQUMvQixTQUFLLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQzs7QUFFbEMsUUFBSSxPQUFPLE9BQU8sS0FBSyxXQUFXLElBQUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxFQUFFO0FBQy9FLFVBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsVUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTs7QUFDcEIsY0FBTSxHQUFHLEtBQUssQ0FBQztPQUNoQjs7d0NBUG1CLE9BQU87QUFBUCxlQUFPOzs7QUFRM0IsYUFBTyxDQUFDLE1BQU0sT0FBQyxDQUFmLE9BQU8sRUFBWSxPQUFPLENBQUMsQ0FBQztLQUM3QjtHQUNGO0NBQ0YsQ0FBQzs7cUJBRWEsTUFBTTs7Ozs7Ozs7Ozs7cUJDakNOLFVBQVMsVUFBVSxFQUFFOztBQUVsQyxNQUFJLElBQUksR0FBRyxPQUFPLE1BQU0sS0FBSyxXQUFXLEdBQUcsTUFBTSxHQUFHLE1BQU07TUFDdEQsV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7O0FBRWxDLFlBQVUsQ0FBQyxVQUFVLEdBQUcsWUFBVztBQUNqQyxRQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssVUFBVSxFQUFFO0FBQ2xDLFVBQUksQ0FBQyxVQUFVLEdBQUcsV0FBVyxDQUFDO0tBQy9CO0FBQ0QsV0FBTyxVQUFVLENBQUM7R0FDbkIsQ0FBQztDQUNIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3FCQ1pzQixTQUFTOztJQUFwQixLQUFLOzt5QkFDSyxhQUFhOzs7O29CQUM4QixRQUFROztBQUVsRSxTQUFTLGFBQWEsQ0FBQyxZQUFZLEVBQUU7QUFDMUMsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7TUFDdkQsZUFBZSwwQkFBb0IsQ0FBQzs7QUFFMUMsTUFBSSxnQkFBZ0IsS0FBSyxlQUFlLEVBQUU7QUFDeEMsUUFBSSxnQkFBZ0IsR0FBRyxlQUFlLEVBQUU7QUFDdEMsVUFBTSxlQUFlLEdBQUcsdUJBQWlCLGVBQWUsQ0FBQztVQUNuRCxnQkFBZ0IsR0FBRyx1QkFBaUIsZ0JBQWdCLENBQUMsQ0FBQztBQUM1RCxZQUFNLDJCQUFjLHlGQUF5RixHQUN2RyxxREFBcUQsR0FBRyxlQUFlLEdBQUcsbURBQW1ELEdBQUcsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDaEssTUFBTTs7QUFFTCxZQUFNLDJCQUFjLHdGQUF3RixHQUN0RyxpREFBaUQsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDbkY7R0FDRjtDQUNGOztBQUVNLFNBQVMsUUFBUSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7O0FBRTFDLE1BQUksQ0FBQyxHQUFHLEVBQUU7QUFDUixVQUFNLDJCQUFjLG1DQUFtQyxDQUFDLENBQUM7R0FDMUQ7QUFDRCxNQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRTtBQUN2QyxVQUFNLDJCQUFjLDJCQUEyQixHQUFHLE9BQU8sWUFBWSxDQUFDLENBQUM7R0FDeEU7O0FBRUQsY0FBWSxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQzs7OztBQUlsRCxLQUFHLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7O0FBRTVDLFdBQVMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDdkQsUUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFO0FBQ2hCLGFBQU8sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xELFVBQUksT0FBTyxDQUFDLEdBQUcsRUFBRTtBQUNmLGVBQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO09BQ3ZCO0tBQ0Y7O0FBRUQsV0FBTyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN0RSxRQUFJLE1BQU0sR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7O0FBRXhFLFFBQUksTUFBTSxJQUFJLElBQUksSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFO0FBQ2pDLGFBQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDekYsWUFBTSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUMzRDtBQUNELFFBQUksTUFBTSxJQUFJLElBQUksRUFBRTtBQUNsQixVQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUU7QUFDbEIsWUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMvQixhQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzVDLGNBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7QUFDNUIsa0JBQU07V0FDUDs7QUFFRCxlQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdEM7QUFDRCxjQUFNLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztPQUMzQjtBQUNELGFBQU8sTUFBTSxDQUFDO0tBQ2YsTUFBTTtBQUNMLFlBQU0sMkJBQWMsY0FBYyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsMERBQTBELENBQUMsQ0FBQztLQUNqSDtHQUNGOzs7QUFHRCxNQUFJLFNBQVMsR0FBRztBQUNkLFVBQU0sRUFBRSxnQkFBUyxHQUFHLEVBQUUsSUFBSSxFQUFFO0FBQzFCLFVBQUksRUFBRSxJQUFJLElBQUksR0FBRyxDQUFBLEFBQUMsRUFBRTtBQUNsQixjQUFNLDJCQUFjLEdBQUcsR0FBRyxJQUFJLEdBQUcsbUJBQW1CLEdBQUcsR0FBRyxDQUFDLENBQUM7T0FDN0Q7QUFDRCxhQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNsQjtBQUNELFVBQU0sRUFBRSxnQkFBUyxNQUFNLEVBQUUsSUFBSSxFQUFFO0FBQzdCLFVBQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7QUFDMUIsV0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM1QixZQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFO0FBQ3hDLGlCQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUN4QjtPQUNGO0tBQ0Y7QUFDRCxVQUFNLEVBQUUsZ0JBQVMsT0FBTyxFQUFFLE9BQU8sRUFBRTtBQUNqQyxhQUFPLE9BQU8sT0FBTyxLQUFLLFVBQVUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE9BQU8sQ0FBQztLQUN4RTs7QUFFRCxvQkFBZ0IsRUFBRSxLQUFLLENBQUMsZ0JBQWdCO0FBQ3hDLGlCQUFhLEVBQUUsb0JBQW9COztBQUVuQyxNQUFFLEVBQUUsWUFBUyxDQUFDLEVBQUU7QUFDZCxVQUFJLEdBQUcsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsU0FBRyxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ3ZDLGFBQU8sR0FBRyxDQUFDO0tBQ1o7O0FBRUQsWUFBUSxFQUFFLEVBQUU7QUFDWixXQUFPLEVBQUUsaUJBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0FBQ25FLFVBQUksY0FBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1VBQ2pDLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLFVBQUksSUFBSSxJQUFJLE1BQU0sSUFBSSxXQUFXLElBQUksbUJBQW1CLEVBQUU7QUFDeEQsc0JBQWMsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztPQUMzRixNQUFNLElBQUksQ0FBQyxjQUFjLEVBQUU7QUFDMUIsc0JBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO09BQzlEO0FBQ0QsYUFBTyxjQUFjLENBQUM7S0FDdkI7O0FBRUQsUUFBSSxFQUFFLGNBQVMsS0FBSyxFQUFFLEtBQUssRUFBRTtBQUMzQixhQUFPLEtBQUssSUFBSSxLQUFLLEVBQUUsRUFBRTtBQUN2QixhQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztPQUN2QjtBQUNELGFBQU8sS0FBSyxDQUFDO0tBQ2Q7QUFDRCxTQUFLLEVBQUUsZUFBUyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQzdCLFVBQUksR0FBRyxHQUFHLEtBQUssSUFBSSxNQUFNLENBQUM7O0FBRTFCLFVBQUksS0FBSyxJQUFJLE1BQU0sSUFBSyxLQUFLLEtBQUssTUFBTSxBQUFDLEVBQUU7QUFDekMsV0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztPQUN2Qzs7QUFFRCxhQUFPLEdBQUcsQ0FBQztLQUNaOztBQUVELFFBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUk7QUFDakIsZ0JBQVksRUFBRSxZQUFZLENBQUMsUUFBUTtHQUNwQyxDQUFDOztBQUVGLFdBQVMsR0FBRyxDQUFDLE9BQU8sRUFBZ0I7UUFBZCxPQUFPLHlEQUFHLEVBQUU7O0FBQ2hDLFFBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7O0FBRXhCLE9BQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDcEIsUUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRTtBQUM1QyxVQUFJLEdBQUcsUUFBUSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztLQUNoQztBQUNELFFBQUksTUFBTSxZQUFBO1FBQ04sV0FBVyxHQUFHLFlBQVksQ0FBQyxjQUFjLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQztBQUMvRCxRQUFJLFlBQVksQ0FBQyxTQUFTLEVBQUU7QUFDMUIsVUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFO0FBQ2xCLGNBQU0sR0FBRyxPQUFPLEtBQUssT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztPQUM1RixNQUFNO0FBQ0wsY0FBTSxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7T0FDcEI7S0FDRjs7QUFFRCxhQUFTLElBQUksQ0FBQyxPQUFPLGdCQUFlO0FBQ2xDLGFBQU8sRUFBRSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztLQUNySDtBQUNELFFBQUksR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3RHLFdBQU8sSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztHQUMvQjtBQUNELEtBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDOztBQUVqQixLQUFHLENBQUMsTUFBTSxHQUFHLFVBQVMsT0FBTyxFQUFFO0FBQzdCLFFBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFO0FBQ3BCLGVBQVMsQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQzs7QUFFbEUsVUFBSSxZQUFZLENBQUMsVUFBVSxFQUFFO0FBQzNCLGlCQUFTLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7T0FDdEU7QUFDRCxVQUFJLFlBQVksQ0FBQyxVQUFVLElBQUksWUFBWSxDQUFDLGFBQWEsRUFBRTtBQUN6RCxpQkFBUyxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO09BQzVFO0tBQ0YsTUFBTTtBQUNMLGVBQVMsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztBQUNwQyxlQUFTLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDdEMsZUFBUyxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDO0tBQzNDO0dBQ0YsQ0FBQzs7QUFFRixLQUFHLENBQUMsTUFBTSxHQUFHLFVBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0FBQ2xELFFBQUksWUFBWSxDQUFDLGNBQWMsSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUMvQyxZQUFNLDJCQUFjLHdCQUF3QixDQUFDLENBQUM7S0FDL0M7QUFDRCxRQUFJLFlBQVksQ0FBQyxTQUFTLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDckMsWUFBTSwyQkFBYyx5QkFBeUIsQ0FBQyxDQUFDO0tBQ2hEOztBQUVELFdBQU8sV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0dBQ2pGLENBQUM7QUFDRixTQUFPLEdBQUcsQ0FBQztDQUNaOztBQUVNLFNBQVMsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0FBQzVGLFdBQVMsSUFBSSxDQUFDLE9BQU8sRUFBZ0I7UUFBZCxPQUFPLHlEQUFHLEVBQUU7O0FBQ2pDLFFBQUksYUFBYSxHQUFHLE1BQU0sQ0FBQztBQUMzQixRQUFJLE1BQU0sSUFBSSxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQ25DLG1CQUFhLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDMUM7O0FBRUQsV0FBTyxFQUFFLENBQUMsU0FBUyxFQUNmLE9BQU8sRUFDUCxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQ3JDLE9BQU8sQ0FBQyxJQUFJLElBQUksSUFBSSxFQUNwQixXQUFXLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUN4RCxhQUFhLENBQUMsQ0FBQztHQUNwQjs7QUFFRCxNQUFJLEdBQUcsaUJBQWlCLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQzs7QUFFekUsTUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7QUFDakIsTUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDeEMsTUFBSSxDQUFDLFdBQVcsR0FBRyxtQkFBbUIsSUFBSSxDQUFDLENBQUM7QUFDNUMsU0FBTyxJQUFJLENBQUM7Q0FDYjs7QUFFTSxTQUFTLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtBQUN4RCxNQUFJLENBQUMsT0FBTyxFQUFFO0FBQ1osUUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLGdCQUFnQixFQUFFO0FBQ3JDLGFBQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0tBQ3pDLE1BQU07QUFDTCxhQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDMUM7R0FDRixNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRTs7QUFFekMsV0FBTyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUM7QUFDdkIsV0FBTyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7R0FDckM7QUFDRCxTQUFPLE9BQU8sQ0FBQztDQUNoQjs7QUFFTSxTQUFTLGFBQWEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtBQUN2RCxTQUFPLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztBQUN2QixNQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUU7QUFDZixXQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO0dBQ3ZFOztBQUVELE1BQUksWUFBWSxZQUFBLENBQUM7QUFDakIsTUFBSSxPQUFPLENBQUMsRUFBRSxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssSUFBSSxFQUFFO0FBQ3JDLFdBQU8sQ0FBQyxJQUFJLEdBQUcsa0JBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3pDLGdCQUFZLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDOztBQUUxRCxRQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUU7QUFDekIsYUFBTyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztLQUM5RTtHQUNGOztBQUVELE1BQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxZQUFZLEVBQUU7QUFDekMsV0FBTyxHQUFHLFlBQVksQ0FBQztHQUN4Qjs7QUFFRCxNQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUU7QUFDekIsVUFBTSwyQkFBYyxjQUFjLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxDQUFDO0dBQzVFLE1BQU0sSUFBSSxPQUFPLFlBQVksUUFBUSxFQUFFO0FBQ3RDLFdBQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztHQUNsQztDQUNGOztBQUVNLFNBQVMsSUFBSSxHQUFHO0FBQUUsU0FBTyxFQUFFLENBQUM7Q0FBRTs7QUFFckMsU0FBUyxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRTtBQUMvQixNQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsTUFBTSxJQUFJLElBQUksQ0FBQSxBQUFDLEVBQUU7QUFDOUIsUUFBSSxHQUFHLElBQUksR0FBRyxrQkFBWSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDckMsUUFBSSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUM7R0FDckI7QUFDRCxTQUFPLElBQUksQ0FBQztDQUNiOztBQUVELFNBQVMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUU7QUFDekUsTUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFO0FBQ2hCLFFBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztBQUNmLFFBQUksR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUM1RixTQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztHQUMzQjtBQUNELFNBQU8sSUFBSSxDQUFDO0NBQ2I7Ozs7Ozs7O0FDM1FELFNBQVMsVUFBVSxDQUFDLE1BQU0sRUFBRTtBQUMxQixNQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztDQUN0Qjs7QUFFRCxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFXO0FBQ3ZFLFNBQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7Q0FDekIsQ0FBQzs7cUJBRWEsVUFBVTs7Ozs7Ozs7Ozs7Ozs7O0FDVHpCLElBQU0sTUFBTSxHQUFHO0FBQ2IsS0FBRyxFQUFFLE9BQU87QUFDWixLQUFHLEVBQUUsTUFBTTtBQUNYLEtBQUcsRUFBRSxNQUFNO0FBQ1gsS0FBRyxFQUFFLFFBQVE7QUFDYixLQUFHLEVBQUUsUUFBUTtBQUNiLEtBQUcsRUFBRSxRQUFRO0FBQ2IsS0FBRyxFQUFFLFFBQVE7Q0FDZCxDQUFDOztBQUVGLElBQU0sUUFBUSxHQUFHLFlBQVk7SUFDdkIsUUFBUSxHQUFHLFdBQVcsQ0FBQzs7QUFFN0IsU0FBUyxVQUFVLENBQUMsR0FBRyxFQUFFO0FBQ3ZCLFNBQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0NBQ3BCOztBQUVNLFNBQVMsTUFBTSxDQUFDLEdBQUcsb0JBQW1CO0FBQzNDLE9BQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ3pDLFNBQUssSUFBSSxHQUFHLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQzVCLFVBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtBQUMzRCxXQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO09BQzlCO0tBQ0Y7R0FDRjs7QUFFRCxTQUFPLEdBQUcsQ0FBQztDQUNaOztBQUVNLElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDOzs7Ozs7QUFLaEQsSUFBSSxVQUFVLEdBQUcsb0JBQVMsS0FBSyxFQUFFO0FBQy9CLFNBQU8sT0FBTyxLQUFLLEtBQUssVUFBVSxDQUFDO0NBQ3BDLENBQUM7OztBQUdGLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0FBQ25CLFVBSU0sVUFBVSxHQUpoQixVQUFVLEdBQUcsVUFBUyxLQUFLLEVBQUU7QUFDM0IsV0FBTyxPQUFPLEtBQUssS0FBSyxVQUFVLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxtQkFBbUIsQ0FBQztHQUNwRixDQUFDO0NBQ0g7UUFDTyxVQUFVLEdBQVYsVUFBVTs7Ozs7QUFJWCxJQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxJQUFJLFVBQVMsS0FBSyxFQUFFO0FBQ3RELFNBQU8sQUFBQyxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxHQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0NBQ2pHLENBQUM7Ozs7O0FBR0ssU0FBUyxPQUFPLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRTtBQUNwQyxPQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2hELFFBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssRUFBRTtBQUN0QixhQUFPLENBQUMsQ0FBQztLQUNWO0dBQ0Y7QUFDRCxTQUFPLENBQUMsQ0FBQyxDQUFDO0NBQ1g7O0FBR00sU0FBUyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUU7QUFDdkMsTUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUU7O0FBRTlCLFFBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUU7QUFDM0IsYUFBTyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDeEIsTUFBTSxJQUFJLE1BQU0sSUFBSSxJQUFJLEVBQUU7QUFDekIsYUFBTyxFQUFFLENBQUM7S0FDWCxNQUFNLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDbEIsYUFBTyxNQUFNLEdBQUcsRUFBRSxDQUFDO0tBQ3BCOzs7OztBQUtELFVBQU0sR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDO0dBQ3RCOztBQUVELE1BQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO0FBQUUsV0FBTyxNQUFNLENBQUM7R0FBRTtBQUM5QyxTQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0NBQzdDOztBQUVNLFNBQVMsT0FBTyxDQUFDLEtBQUssRUFBRTtBQUM3QixNQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUU7QUFDekIsV0FBTyxJQUFJLENBQUM7R0FDYixNQUFNLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQy9DLFdBQU8sSUFBSSxDQUFDO0dBQ2IsTUFBTTtBQUNMLFdBQU8sS0FBSyxDQUFDO0dBQ2Q7Q0FDRjs7QUFFTSxTQUFTLFdBQVcsQ0FBQyxNQUFNLEVBQUU7QUFDbEMsTUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUMvQixPQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztBQUN2QixTQUFPLEtBQUssQ0FBQztDQUNkOztBQUVNLFNBQVMsV0FBVyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7QUFDdkMsUUFBTSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7QUFDbEIsU0FBTyxNQUFNLENBQUM7Q0FDZjs7QUFFTSxTQUFTLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxFQUFFLEVBQUU7QUFDakQsU0FBTyxDQUFDLFdBQVcsR0FBRyxXQUFXLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQSxHQUFJLEVBQUUsQ0FBQztDQUNwRDs7OztBQzNHRDtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IGFuYWx5emVIb2xkZW0gPSByZXF1aXJlKCcuL2xpYi9ob2xkZW0nKVxuXG4vKipcbiAqIEFuYWx5emVzIGEgZ2l2ZW4gUG9rZXJIYW5kIHdoaWNoIGhhcyBiZWVuIHBhcnNlZCBieSB0aGUgSGFuZEhpc3RvcnkgUGFyc2VyIGhocC5cbiAqIFJlbGF0aXZlIHBsYXllciBwb3NpdGlvbnMgYXJlIGNhbGN1bGF0ZWQsIGkuZS4gY3V0b2ZmLCBidXR0b24sIGV0Yy5cbiAqIFBsYXllcnMgYXJlIGluY2x1ZGVkIGluIG9yZGVyIG9mIGFjdGlvbiBvbiBmbG9wLlxuICpcbiAqIFRoZSBhbmFseXplZCBoYW5kIHRoZW4gY2FuIGJlIHZpc3VhbGl6ZWQgYnkgW2hodl0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hodikuXG4gKlxuICogRm9yIGFuIGV4YW1wbGUgb2YgYW4gYW5hbHl6ZWQgaGFuZCBwbGVhc2UgdmlldyBbanNvbiBvdXRwdXQgb2YgYW4gYW5hbHl6ZWRcbiAqIGhhbmRdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaHYvYmxvYi9tYXN0ZXIvdGVzdC9maXh0dXJlcy9ob2xkZW0vYWN0aW9ub25hbGwuanNvbikuXG4gKlxuICogQG5hbWUgYW5hbHl6ZVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge29iamVjdH0gaGFuZCBoYW5kIGhpc3RvcnkgYXMgcGFyc2VkIGJ5IFtoaHBdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaHApXG4gKiBAcmV0dXJuIHtvYmplY3R9IHRoZSBhbmFseXplZCBoYW5kXG4gKi9cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFuYWx5emUoaGFuZCkge1xuICBpZiAoIWhhbmQuaW5mbykgdGhyb3cgbmV3IEVycm9yKCdIYW5kIGlzIG1pc3NpbmcgaW5mbycpXG4gIGlmIChoYW5kLmluZm8ucG9rZXJ0eXBlID09PSAnaG9sZGVtJykgcmV0dXJuIGFuYWx5emVIb2xkZW0oaGFuZClcbn1cblxuZXhwb3J0cy5zY3JpcHQgICAgID0gcmVxdWlyZSgnLi9saWIvc2NyaXB0JylcbmV4cG9ydHMuc3Rvcnlib2FyZCA9IHJlcXVpcmUoJy4vbGliL3N0b3J5Ym9hcmQnKVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuY29uc3QgY2FyZE9yZGVyID0gWyAnMicsICczJywgJzQnLCAnNScsICc2JywgJzcnLCAnOCcsICdUJywgJ0onLCAnUScsICdLJywgJ0EnIF1cbmNvbnN0IHN0cmF0ZWdpY1Bvc2l0aW9ucyA9IHJlcXVpcmUoJy4vc3RyYXRlZ2ljLXBvc2l0aW9ucycpXG5cbmZ1bmN0aW9uIHJvdW5kKG4pIHtcbiAgcmV0dXJuIE1hdGgucm91bmQobiAqIDEwKSAvIDEwXG59XG5cbmZ1bmN0aW9uIG5vdG1ldGFkYXRhKGspIHtcbiAgcmV0dXJuIGsgIT09ICdtZXRhZGF0YSdcbn1cblxuZnVuY3Rpb24gY29weVZhbHVlcyhvKSB7XG4gIGZ1bmN0aW9uIGNvcHkoYWNjLCBrKSB7XG4gICAgYWNjW2tdID0gb1trXVxuICAgIHJldHVybiBhY2NcbiAgfVxuICBpZiAoIW8pIHJldHVybiBvXG4gIHJldHVybiBPYmplY3Qua2V5cyhvKVxuICAgIC5maWx0ZXIobm90bWV0YWRhdGEpXG4gICAgLnJlZHVjZShjb3B5LCB7fSlcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSG9sZUNhcmRzKGhjKSB7XG4gIGlmICghaGMpIHJldHVybiBoY1xuICBjb25zdCBjMSA9IGhjLmNhcmQxXG4gIGNvbnN0IGMyID0gaGMuY2FyZDJcbiAgaWYgKCFjMSB8fCAhYzIpIHJldHVybiBoY1xuICAvLyBzaG93IGxhcmdlIGNhcmQgYmVmb3JlIHNtYWxsZXIgY2FyZFxuICByZXR1cm4gY2FyZE9yZGVyLmluZGV4T2YoYzFbMF0pIDwgY2FyZE9yZGVyLmluZGV4T2YoYzJbMF0pXG4gICAgPyB7IGNhcmQxOiBjMiwgY2FyZDI6IGMxIH0gOiB7IGNhcmQxOiBjMSwgY2FyZDI6IGMyIH1cbn1cblxuZnVuY3Rpb24gZ2V0U3RhcnRpbmdQb3QobywgcGxheWVyQ291bnQpIHtcbiAgY29uc3QgdG90YWxBbnRlID0gKG8uYW50ZSB8fCAwKSAqIHBsYXllckNvdW50XG4gIHJldHVybiAgKG8uc2IgfHwgMCkgKyAoby5iYiB8fCAwKSArIHRvdGFsQW50ZVxufVxuXG5mdW5jdGlvbiBwb3N0RmxvcE9yZGVyRnJvbVByZWZsb3BPcmRlcihuLCBwbGF5ZXJDb3VudCkge1xuICAvLyBoZWFkc3VwIGp1c3QgcmV2ZXJzZXMgdGhlIG9yZGVyXG4gIGlmIChwbGF5ZXJDb3VudCA9PT0gMikgcmV0dXJuIG4gPT09IDAgPyAxIDogMFxuXG4gIGlmIChuID09PSAocGxheWVyQ291bnQgLSAxKSkgcmV0dXJuIDEgLy8gQkJcbiAgaWYgKG4gPT09IChwbGF5ZXJDb3VudCAtIDIpKSByZXR1cm4gMCAvLyBTQlxuICByZXR1cm4gbiArIDJcbn1cbmZ1bmN0aW9uIGJ5UG9zdEZsb3BPcmRlcihwMSwgcDIpIHtcbiAgcmV0dXJuIHAxLnBvc3RmbG9wT3JkZXIgLSBwMi5wb3N0ZmxvcE9yZGVyXG59XG5cbmZ1bmN0aW9uIHNvcnRQbGF5ZXJzQnlQb3N0RmxvcE9yZGVyKHBsYXllcnMpIHtcbiAgZnVuY3Rpb24gYXBwZW5kUGxheWVyKGFjYywgaykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXJzW2tdXG4gICAgcC5uYW1lID0ga1xuICAgIGFjYy5wdXNoKHApXG4gICAgcmV0dXJuIGFjY1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhwbGF5ZXJzKVxuICAgIC5yZWR1Y2UoYXBwZW5kUGxheWVyLCBbXSlcbiAgICAuc29ydChieVBvc3RGbG9wT3JkZXIpXG59XG5cbmZ1bmN0aW9uIHBsYXllckludmVzdGVkKHByZWZsb3ApIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwcmVmbG9wLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYWN0aW9uID0gcHJlZmxvcFtpXS50eXBlXG4gICAgaWYgKGFjdGlvbiA9PT0gJ2JldCcgfHwgYWN0aW9uID09PSAnY2FsbCcgfHwgYWN0aW9uID09PSAncmFpc2UnKSByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBwbGF5ZXJTYXdTaG93ZG93bihwKSB7XG4gIGlmIChwLnNob3dkb3duLmxlbmd0aCkgcmV0dXJuIHRydWVcbiAgaWYgKHAucml2ZXIubGVuZ3RoICYmIHAucml2ZXJbcC5yaXZlci5sZW5ndGggLSAxXS50eXBlICE9PSAnZm9sZCcpIHJldHVybiB0cnVlXG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBhZGRBY3Rpdml0eUluZm8ocGxheWVycywgaW5mbykge1xuICBsZXQgYW55SW52ZXN0ZWQgICAgPSBmYWxzZVxuICBsZXQgYW55U2F3RmxvcCAgICAgPSBmYWxzZVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBsYXllcnMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwbGF5ZXIgICAgICAgPSBwbGF5ZXJzW2ldXG4gICAgcGxheWVyLmludmVzdGVkICAgID0gcGxheWVyLnNiIHx8IHBsYXllci5iYiB8fCBwbGF5ZXJJbnZlc3RlZChwbGF5ZXIucHJlZmxvcClcbiAgICBwbGF5ZXIuc2F3RmxvcCAgICAgPSAhIXBsYXllci5mbG9wLmxlbmd0aFxuICAgIHBsYXllci5zYXdTaG93ZG93biA9IHBsYXllclNhd1Nob3dkb3duKHBsYXllcilcblxuICAgIGlmICghYW55SW52ZXN0ZWQpIGFueUludmVzdGVkID0gcGxheWVyLmludmVzdGVkXG4gICAgaWYgKCFhbnlTYXdGbG9wKSBhbnlTYXdGbG9wICAgPSBwbGF5ZXIuc2F3RmxvcFxuICB9XG5cbiAgaW5mby5hbnlJbnZlc3RlZCAgICA9IGFueUludmVzdGVkXG4gIGluZm8uYW55U2F3RmxvcCAgICAgPSBhbnlTYXdGbG9wXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNoaXBzKHByZXYsIGN1cnJlbnQsIGludmVzdGVkcywgcGxheWVycywgaGFuZCkge1xuICBPYmplY3Qua2V5cyhwbGF5ZXJzKVxuICAgIC5mb3JFYWNoKHVwZGF0ZVBsYXllckNoaXBzLCB7IHByZXY6IHByZXYsIGN1cnJlbnQ6IGN1cnJlbnQgfSlcblxuICBmdW5jdGlvbiB1cGRhdGVQbGF5ZXJDaGlwcyhrKSB7XG4gICAgY29uc3QgcCA9IHBsYXllcnNba11cbiAgICBsZXQgY2hpcHMgPSBwW3RoaXMucHJldl0gLSAoaW52ZXN0ZWRzW2tdIHx8IDApXG4gICAgaWYgKHRoaXMucHJldiA9PT0gJ2NoaXBzUHJlZmxvcCcpIHtcbiAgICAgIGlmIChwLmJiKSBjaGlwcyArPSBoYW5kLmluZm8uYmJcbiAgICAgIGlmIChwLnNiKSBjaGlwcyArPSBoYW5kLmluZm8uc2JcbiAgICB9XG4gICAgcC5jaGlwc0FmdGVyID0gcFt0aGlzLmN1cnJlbnRdID0gY2hpcHNcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGlwc0ZvckFjdGlvbihjaGlwcywgYWN0aW9uLCBjb3N0LCBwbGF5ZXIpIHtcbiAgYWN0aW9uLmNoaXBzID0gY2hpcHNbcGxheWVyXVxuICBjaGlwc1twbGF5ZXJdIC09IGNvc3RcbiAgYWN0aW9uLmNoaXBzQWZ0ZXIgPSBjaGlwc1twbGF5ZXJdXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYW5hbHl6ZUhvbGRlbShoYW5kKSB7XG4gIGxldCBwb3QgPSAwXG4gIGxldCBjdXJyZW50QmV0ID0gaGFuZC5pbmZvLmJiXG5cbiAgY29uc3QgcGxheWVyQ291bnQgPSBoYW5kLnNlYXRzLmxlbmd0aFxuICBjb25zdCBzdGFydGluZ1BvdCA9IGdldFN0YXJ0aW5nUG90KGhhbmQuaW5mbywgcGxheWVyQ291bnQpXG5cbiAgY29uc3QgcGxheWVycyA9IHt9XG4gIGNvbnN0IGFuYWx5emVkID0ge1xuICAgICAgaW5mbyAgICA6IGNvcHlWYWx1ZXMoaGFuZC5pbmZvKVxuICAgICwgdGFibGUgICA6IGNvcHlWYWx1ZXMoaGFuZC50YWJsZSlcbiAgICAsIGJvYXJkICAgOiBjb3B5VmFsdWVzKGhhbmQuYm9hcmQpXG4gICAgLCBoZXJvICAgIDogaGFuZC5oZXJvXG4gIH1cbiAgYW5hbHl6ZWQucG90cyA9IHtcbiAgICBwcmVmbG9wOiBzdGFydGluZ1BvdFxuICB9XG4gIGFuYWx5emVkLmluZm8ucGxheWVycyA9IHBsYXllckNvdW50XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGF5ZXJDb3VudDsgaSsrKSB7XG4gICAgY29uc3QgcyA9IGhhbmQuc2VhdHNbaV1cbiAgICBjb25zdCBwbGF5ZXIgPSB7XG4gICAgICAgIHNlYXRubyAgICAgICAgOiBzLnNlYXRub1xuICAgICAgLCBjaGlwcyAgICAgICAgIDogcy5jaGlwc1xuICAgICAgLCBjaGlwc1ByZWZsb3AgIDogcy5jaGlwc1xuICAgICAgLCBjaGlwc0Zsb3AgICAgIDogTmFOXG4gICAgICAsIGNoaXBzVHVybiAgICAgOiBOYU5cbiAgICAgICwgY2hpcHNSaXZlciAgICA6IE5hTlxuICAgICAgLCBjaGlwc1Nob3dkb3duIDogTmFOXG4gICAgICAsIGNoaXBzQWZ0ZXIgICAgOiBOYU5cbiAgICAgICwgbSAgICAgICAgICAgICA6IE1hdGgucm91bmQocy5jaGlwcyAvIHN0YXJ0aW5nUG90KVxuICAgICAgLCBwcmVmbG9wICAgICAgIDogW11cbiAgICAgICwgZmxvcCAgICAgICAgICA6IFtdXG4gICAgICAsIHR1cm4gICAgICAgICAgOiBbXVxuICAgICAgLCByaXZlciAgICAgICAgIDogW11cbiAgICAgICwgc2hvd2Rvd24gICAgICA6IFtdXG4gICAgfVxuICAgIGlmIChoYW5kLnRhYmxlLmJ1dHRvbiA9PT0gcy5zZWF0bm8pIHBsYXllci5idXR0b24gPSB0cnVlXG4gICAgaWYgKGhhbmQuaGVybyA9PT0gcy5wbGF5ZXIpIHtcbiAgICAgIHBsYXllci5oZXJvID0gdHJ1ZVxuICAgICAgaWYgKGhhbmQuaG9sZWNhcmRzKSB7XG4gICAgICAgIHBsYXllci5jYXJkcyA9IG5vcm1hbGl6ZUhvbGVDYXJkcyhoYW5kLmhvbGVjYXJkcylcbiAgICAgIH1cbiAgICB9XG4gICAgcGxheWVyc1tzLnBsYXllcl0gPSBwbGF5ZXJcbiAgfVxuICBhbmFseXplZC5wbGF5ZXJzID0gcGxheWVyc1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZC5wb3N0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnBvc3RzW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBwb3QgKz0gcC5hbW91bnRcbiAgICBwbGF5ZXIuY2hpcHNBZnRlciA9IHBsYXllci5jaGlwc1ByZWZsb3AgLT0gcC5hbW91bnRcblxuICAgIGlmIChwLnR5cGUgPT09ICdzYicpIHBsYXllci5zYiA9IHRydWVcbiAgICBpZiAocC50eXBlID09PSAnYmInKSBwbGF5ZXIuYmIgPSB0cnVlXG4gIH1cblxuICBmdW5jdGlvbiBhbmFseXplQWN0aW9uKHAsIGludmVzdGVkLCBjaGlwcykge1xuICAgIGNvbnN0IHN0YXJ0aW5nUG90ID0gcG90XG4gICAgbGV0IGNvc3QgPSAwXG4gICAgbGV0IGJldERlbHRhID0gMFxuICAgIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHR5cGU6IHAudHlwZVxuICAgIH1cbiAgICBpZiAocC50eXBlID09PSAncmFpc2UnKSB7XG4gICAgICBhY3Rpb24ucmF0aW8gPSByb3VuZChwLnJhaXNlVG8gLyBjdXJyZW50QmV0KVxuICAgICAgYWN0aW9uLmFsbGluID0gISFwLmFsbGluXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5yYWlzZVRvIC0gaW52ZXN0ZWRcbiAgICAgIGJldERlbHRhID0gMVxuICAgICAgY3VycmVudEJldCA9IHAucmFpc2VUb1xuICAgICAgcG90ICs9IGN1cnJlbnRCZXRcbiAgICAgIGNvc3QgPSBhY3Rpb24uYW1vdW50XG4gICAgfSBlbHNlIGlmIChwLnR5cGUgPT09ICdiZXQnKSB7XG4gICAgICBhY3Rpb24ucmF0aW8gPSByb3VuZChwLmFtb3VudCAvIHBvdClcbiAgICAgIGFjdGlvbi5hbGxpbiA9ICEhcC5hbGxpblxuICAgICAgYWN0aW9uLmFtb3VudCA9IHAuYW1vdW50XG4gICAgICBjdXJyZW50QmV0ID0gcC5hbW91bnRcbiAgICAgIHBvdCArPSBjdXJyZW50QmV0XG4gICAgICBjb3N0ID0gYWN0aW9uLmFtb3VudFxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnY2FsbCcpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAuYW1vdW50IC8gcG90KVxuICAgICAgYWN0aW9uLmFsbGluID0gISFwLmFsbGluXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5hbW91bnRcbiAgICAgIHBvdCArPSBwLmFtb3VudFxuICAgICAgY29zdCA9IGFjdGlvbi5hbW91bnRcbiAgICB9IGVsc2UgaWYgKHAudHlwZSA9PT0gJ2NvbGxlY3QnKSB7XG4gICAgICBhY3Rpb24ucmF0aW8gPSByb3VuZChwLmFtb3VudCAvIHBvdClcbiAgICAgIGFjdGlvbi5hbGxpbiA9IGZhbHNlXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5hbW91bnRcbiAgICAgIGNvc3QgPSAtcG90XG4gICAgICBwb3QgPSAwXG4gICAgfSBlbHNlIGlmIChwLnR5cGUgPT09ICdiZXQtcmV0dXJuZWQnKSB7XG4gICAgICBhY3Rpb24ucmF0aW8gPSByb3VuZChwLmFtb3VudCAvIHBvdClcbiAgICAgIGFjdGlvbi5hbGxpbiA9IGZhbHNlXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5hbW91bnRcbiAgICAgIGNvc3QgPSAtcC5hbW91bnRcbiAgICAgIHBvdCA9IHBvdCAtIHAuYW1vdW50XG4gICAgfVxuICAgIGFjdGlvbi5wb3QgPSBzdGFydGluZ1BvdFxuICAgIGFjdGlvbi5wb3RBZnRlciA9IHN0YXJ0aW5nUG90ICsgY29zdFxuICAgIGFjdGlvbi5jaGlwcyA9IGNoaXBzXG4gICAgYWN0aW9uLmNoaXBzQWZ0ZXIgPSBjaGlwcyAtIGNvc3RcbiAgICByZXR1cm4geyBhY3Rpb246IGFjdGlvbiwgY29zdDogY29zdCB8fCAwLCBiZXREZWx0YTogYmV0RGVsdGEgfVxuICB9XG5cbiAgbGV0IGludmVzdGVkcyA9IHt9XG4gIGxldCBjaGlwcyA9IHt9XG4gIC8vIHN0YXJ0aW5nIHdpdGggb25lIGJldCwgZmlyc3QgcmFpc2UgaXMgdHdvIGJldCwgbmV4dCB0aHJlZSBiZXQgYW5kIHNvIG9uXG4gIGxldCBiZXQgPSAxXG5cbiAgZnVuY3Rpb24gc3RhcnRQcmVmbG9wQ29zdChwKSB7XG4gICAgaWYgKHAuYmIpIHJldHVybiBoYW5kLmluZm8uYmJcbiAgICBpZiAocC5zYikgcmV0dXJuIGhhbmQuaW5mby5zYlxuICAgIHJldHVybiAwXG4gIH1cblxuICBmdW5jdGlvbiBhZGp1c3RCZXQoaW5mbykge1xuICAgIGJldCA9IGJldCArIGluZm8uYmV0RGVsdGFcbiAgICBpbmZvLmFjdGlvbi5iZXQgPSBiZXRcbiAgfVxuXG4gIC8vXG4gIC8vIFByZWZsb3BcbiAgLy9cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoYW5kLnByZWZsb3AubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5wcmVmbG9wW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBjb25zdCBpbnZlc3RlZCA9IGludmVzdGVkc1twLnBsYXllcl0gfHwgc3RhcnRQcmVmbG9wQ29zdChwbGF5ZXIpXG4gICAgaWYgKHR5cGVvZiBjaGlwc1twLnBsYXllcl0gPT09ICd1bmRlZmluZWQnKSBjaGlwc1twLnBsYXllcl0gPSBwbGF5ZXIuY2hpcHNQcmVmbG9wXG5cbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBhZGp1c3RCZXQoaW5mbylcblxuICAgIHBsYXllci5wcmVmbG9wLnB1c2goaW5mby5hY3Rpb24pXG4gICAgaWYgKCFwbGF5ZXIuaGFzT3duUHJvcGVydHkoJ3ByZWZsb3BPcmRlcicpKSB7XG4gICAgICBwbGF5ZXIucHJlZmxvcE9yZGVyID0gaVxuICAgICAgcGxheWVyLnBvc3RmbG9wT3JkZXIgPSBwb3N0RmxvcE9yZGVyRnJvbVByZWZsb3BPcmRlcihpLCBwbGF5ZXJDb3VudClcbiAgICAgIGNvbnN0IHBvc2l0aW9ucyA9IHN0cmF0ZWdpY1Bvc2l0aW9ucyhpLCBwbGF5ZXJDb3VudClcbiAgICAgIHBsYXllci5wb3MgPSBwb3NpdGlvbnMucG9zXG4gICAgICBwbGF5ZXIuZXhhY3RQb3MgPSBwb3NpdGlvbnMuZXhhY3RQb3NcbiAgICB9XG4gICAgaW52ZXN0ZWRzW3AucGxheWVyXSA9IGludmVzdGVkICsgaW5mby5jb3N0XG4gICAgdXBkYXRlQ2hpcHNGb3JBY3Rpb24oY2hpcHMsIGluZm8uYWN0aW9uLCBpbmZvLmNvc3QsIHAucGxheWVyKVxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc1ByZWZsb3AnLCAnY2hpcHNGbG9wJywgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKVxuXG4gIC8vXG4gIC8vIEZsb3BcbiAgLy9cbiAgYW5hbHl6ZWQucG90cy5mbG9wID0gcG90XG4gIGludmVzdGVkcyA9IHt9XG4gIGJldCA9IDFcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoYW5kLmZsb3AubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5mbG9wW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBjb25zdCBpbnZlc3RlZCA9IGludmVzdGVkc1twLnBsYXllcl0gfHwgMFxuICAgIGNvbnN0IGluZm8gPSBhbmFseXplQWN0aW9uKHAsIGludmVzdGVkKVxuICAgIGFkanVzdEJldChpbmZvKVxuXG4gICAgcGxheWVyLmZsb3AucHVzaChpbmZvLmFjdGlvbilcbiAgICBpbnZlc3RlZHNbcC5wbGF5ZXJdID0gaW52ZXN0ZWQgKyBpbmZvLmNvc3RcbiAgICB1cGRhdGVDaGlwc0ZvckFjdGlvbihjaGlwcywgaW5mby5hY3Rpb24sIGluZm8uY29zdCwgcC5wbGF5ZXIpXG4gIH1cbiAgdXBkYXRlQ2hpcHMoJ2NoaXBzRmxvcCcsICdjaGlwc1R1cm4nLCBpbnZlc3RlZHMsIHBsYXllcnMsIGhhbmQpXG5cbiAgLy9cbiAgLy8gVHVyblxuICAvL1xuICBhbmFseXplZC5wb3RzLnR1cm4gPSBwb3RcbiAgaW52ZXN0ZWRzID0ge31cbiAgYmV0ID0gMVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGhhbmQudHVybi5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnR1cm5baV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIGNvbnN0IGludmVzdGVkID0gaW52ZXN0ZWRzW3AucGxheWVyXSB8fCAwXG4gICAgY29uc3QgaW5mbyA9IGFuYWx5emVBY3Rpb24ocCwgaW52ZXN0ZWQpXG4gICAgYWRqdXN0QmV0KGluZm8pXG5cbiAgICBwbGF5ZXIudHVybi5wdXNoKGluZm8uYWN0aW9uKVxuICAgIGludmVzdGVkc1twLnBsYXllcl0gPSBpbnZlc3RlZCArIGluZm8uY29zdFxuICAgIHVwZGF0ZUNoaXBzRm9yQWN0aW9uKGNoaXBzLCBpbmZvLmFjdGlvbiwgaW5mby5jb3N0LCBwLnBsYXllcilcbiAgfVxuICB1cGRhdGVDaGlwcygnY2hpcHNUdXJuJywgJ2NoaXBzUml2ZXInLCBpbnZlc3RlZHMsIHBsYXllcnMsIGhhbmQpXG5cbiAgLy9cbiAgLy8gUml2ZXJcbiAgLy9cbiAgYW5hbHl6ZWQucG90cy5yaXZlciA9IHBvdFxuICBpbnZlc3RlZHMgPSB7fVxuICBiZXQgPSAxXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZC5yaXZlci5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnJpdmVyW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBjb25zdCBpbnZlc3RlZCA9IGludmVzdGVkc1twLnBsYXllcl0gfHwgMFxuICAgIGNvbnN0IGluZm8gPSBhbmFseXplQWN0aW9uKHAsIGludmVzdGVkKVxuICAgIGFkanVzdEJldChpbmZvKVxuXG4gICAgcGxheWVyLnJpdmVyLnB1c2goaW5mby5hY3Rpb24pXG4gICAgaW52ZXN0ZWRzW3AucGxheWVyXSA9IGludmVzdGVkICsgaW5mby5jb3N0XG4gICAgdXBkYXRlQ2hpcHNGb3JBY3Rpb24oY2hpcHMsIGluZm8uYWN0aW9uLCBpbmZvLmNvc3QsIHAucGxheWVyKVxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc1JpdmVyJywgJ2NoaXBzU2hvd2Rvd24nLCBpbnZlc3RlZHMsIHBsYXllcnMsIGhhbmQpXG5cbiAgLy9cbiAgLy8gU2hvd2Rvd25cbiAgLy9cbiAgYW5hbHl6ZWQucG90cy5zaG93ZG93biA9IHBvdFxuICAvLyBmaXJzdCB3ZSBhZ2dyZWdhdGUgYWxsIGNvbGxlY3Rpb25zIGFuZCB0aGVuIGNvbmRlbnNlIGludG8gb25lIGFjdGlvblxuICBsZXQgY29sbGVjdGVkcyA9IHt9XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZC5zaG93ZG93bi5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnNob3dkb3duW2ldXG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1twLnBsYXllcl1cbiAgICBpZiAocC50eXBlID09PSAnc2hvdycgfHwgcC50eXBlID09PSAnbXVjaycpIHtcbiAgICAgIHBsYXllci5jYXJkcyA9IG5vcm1hbGl6ZUhvbGVDYXJkcyh7IGNhcmQxOiBwLmNhcmQxLCBjYXJkMjogcC5jYXJkMiB9KVxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnY29sbGVjdCcpIHtcbiAgICAgIGNvbGxlY3RlZHNbcC5wbGF5ZXJdID0gKGNvbGxlY3RlZHNbcC5wbGF5ZXJdIHx8IDApICsgcC5hbW91bnRcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhjb2xsZWN0ZWRzKS5mb3JFYWNoKHByb2Nlc3NDb2xsZWN0ZWRzKVxuICBmdW5jdGlvbiBwcm9jZXNzQ29sbGVjdGVkcyhrKSB7XG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1trXVxuICAgIGNvbnN0IGFtb3VudCA9IGNvbGxlY3RlZHNba11cbiAgICBjb25zdCByYXRpbyA9IHJvdW5kKGFtb3VudCAvIHBvdClcbiAgICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICAgIHR5cGUgICAgICAgOiAnY29sbGVjdCdcbiAgICAgICwgcmF0aW8gICAgICA6IHJhdGlvXG4gICAgICAsIHdpbmFsbCAgICAgOiByYXRpbyA9PT0gMVxuICAgICAgLCBhbW91bnQgICAgIDogYW1vdW50XG4gICAgICAsIGNoaXBzICAgICAgOiBjaGlwc1trXVxuICAgICAgLCBjaGlwc0FmdGVyIDogY2hpcHNba10gKyBhbW91bnRcbiAgICB9XG4gICAgcGxheWVyLnNob3dkb3duLnB1c2goYWN0aW9uKVxuICAgIHBsYXllci5jaGlwc0FmdGVyICs9IGFtb3VudFxuICB9XG5cbiAgYW5hbHl6ZWQucGxheWVycyA9IHNvcnRQbGF5ZXJzQnlQb3N0RmxvcE9yZGVyKHBsYXllcnMpXG4gIGFkZEFjdGl2aXR5SW5mbyhhbmFseXplZC5wbGF5ZXJzLCBhbmFseXplZC5pbmZvKVxuICByZXR1cm4gYW5hbHl6ZWRcbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBpZ25vcmVTdHJlZXRzKHApIHtcbiAgZnVuY3Rpb24gY29weShhY2MsIGspIHtcbiAgICBpZiAoayA9PT0gJ3ByZWZsb3AnIHx8IGsgPT09ICdmbG9wJyB8fCBrID09PSAndHVybicgfHwgayA9PT0gJ3JpdmVyJyB8fCBrID09PSAnc2hvd2Rvd24nKSByZXR1cm4gYWNjXG4gICAgYWNjW2tdID0gcFtrXVxuICAgIHJldHVybiBhY2NcbiAgfVxuICByZXR1cm4gT2JqZWN0LmtleXMocCkucmVkdWNlKGNvcHksIHt9KVxufVxuXG5mdW5jdGlvbiBhZGRJbmRleChwLCBpZHgpIHtcbiAgcC5pbmRleCA9IGlkeFxufVxuXG5mdW5jdGlvbiBieVByZWZsb3BPcmRlcihwMSwgcDIpIHtcbiAgcmV0dXJuIHAxLnByZWZsb3BPcmRlciAtIHAyLnByZWZsb3BPcmRlclxufVxuXG5mdW5jdGlvbiBieVBvc3RmbG9wT3JkZXIocDEsIHAyKSB7XG4gIHJldHVybiBwMS5wb3N0ZmxvcE9yZGVyIC0gcDIucG9zdGZsb3BPcmRlclxufVxuXG5mdW5jdGlvbiBhZGRBY3Rpb24oYWN0aW9ucywgc3RhY2tzLCBhY3Rpb24sIHBsYXllcikge1xuICBhY3Rpb25zLnB1c2goeyBhY3Rpb246IGFjdGlvbiwgcGxheWVySW5kZXg6IHBsYXllci5pbmRleCB9KVxufVxuXG5mdW5jdGlvbiBhZGRTdHJlZXQoYWNjLCBzdHJlZXROYW1lLCBwcykge1xuICBjb25zdCBhY3Rpb25zID0gW11cbiAgY29uc3Qgc3RhY2tzID0gW11cbiAgbGV0IGlhID0gMFxuICBsZXQga2VlcEdvaW5nID0gdHJ1ZVxuICB3aGlsZSAoa2VlcEdvaW5nKSB7XG4gICAga2VlcEdvaW5nID0gZmFsc2VcbiAgICBmb3IgKHZhciBpcCA9IDA7IGlwIDwgcHMubGVuZ3RoOyBpcCsrKSB7XG4gICAgICBjb25zdCBwID0gcHNbaXBdXG4gICAgICBjb25zdCBzdHJlZXQgPSBwW3N0cmVldE5hbWVdXG4gICAgICBjb25zdCBhY3Rpb24gPSBzdHJlZXQubGVuZ3RoID4gaWEgJiYgc3RyZWV0W2lhXVxuICAgICAga2VlcEdvaW5nID0ga2VlcEdvaW5nIHx8ICEhYWN0aW9uXG4gICAgICBpZiAoYWN0aW9uKSBhZGRBY3Rpb24oYWN0aW9ucywgc3RhY2tzLCBhY3Rpb24sIHApXG4gICAgfVxuICAgIGlhKytcbiAgfVxuICBhY2Nbc3RyZWV0TmFtZV0gPSBhY3Rpb25zXG59XG5cbi8qKlxuICogU2NyaXB0cyB3aGF0IGhhcHBlbmVkIGluIGEgaGFuZCBpbnRvIGEgYWN0aW9ucyBzY3JpcHQgYXJyYXkuXG4gKiBUaGlzIGFycmF5IGNhbiBiZSByZWFkIHRvcCBkb3duIHRvIHJlcGxheSB0aGUgaGFuZC5cbiAqXG4gKiBUaGUgcGxheWVycyBhbmQgaW5mbyBmaWVsZHMgZnJvbSB0aGUgYW5hbHl6ZWQgZGF0YSBhcmUgY29waWVkIG92ZXIuXG4gKiBFYWNoIGFjdGlvbiBpbmNsdWRlcyB0aGUgaW5kZXggYXQgd2hpY2ggdGhlIHBsYXllciB0aGF0J3MgZXhlY3V0aW5nXG4gKiB0aGUgYWN0aW9uIGNhbiBiZSBmb3VuZCBpbiB0aGUgcGxheWVycyBhcnJheS5cbiAqXG4gKiBTdHJ1Y3R1cmUgb2YgcmV0dXJuZWQgb2JqZWN0OlxuICpcbiAqIGBgYFxuICogaW5mbzogb2JqZWN0IGNvbnRhaW5pbmcgaGFuZCBpbmZvXG4gKiB0YWJsZTogb2JqZWN0IGNvbnRhaW5pbmcgaW5mbyBhYm91dCB0aGUgdGFibGUgbGlrZSB0b3RhbCBzZWF0c1xuICogYm9hcmQ6IG9iamVjdCBjYXJkcyBvbiB0aGUgYm9hcmRcbiAqIHBsYXllcnM6IGFycmF5IG9mIGFsbCBwbGF5ZXJzIGF0IHRoZSB0YWJsZSBpbmNsdWRpbmcgYWxsIGluZm8gYWJvdXQgdGhlaXIgc3RhY2tzXG4gKiBhY3Rpb25zOlxuICogIHByZWZsb3AgIDogYXJyYXkgb2YgcHJlZmxvcCBhY3Rpb25zXG4gKiAgZmxvcCAgICAgOiBhcnJheSBvZiBmbG9wIGFjdGlvbnNcbiAqICB0dXJuICAgICA6IGFycmF5IG9mIHR1cm4gYWN0aW9uc1xuICogIHJpdmVyICAgIDogYXJyYXkgb2Ygcml2ZXIgYWN0aW9uc1xuICogIHNob3dkb3duIDogYXJyYXkgb2Ygc2hvd2Rvd24gYWN0aW9uc1xuICogYGBgXG4gKlxuICogQG5hbWUgaGhyOjpzY3JpcHRcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtvYmplY3R9IGRhdGEgYW5hbHl6ZWQgaGFuZCBkYXRhIEBzZWUgaGhyKClcbiAqIEByZXR1cm4ge29iamVjdH1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzY3JpcHQoZGF0YSkge1xuICBjb25zdCBoYW5kID0ge1xuICAgICAgaW5mbzogZGF0YS5pbmZvXG4gICAgLCB0YWJsZTogZGF0YS50YWJsZVxuICAgICwgYm9hcmQ6IGRhdGEuYm9hcmRcbiAgICAsIHBvdHM6IGRhdGEucG90c1xuICAgICwgcGxheWVyczogZGF0YS5wbGF5ZXJzLm1hcChpZ25vcmVTdHJlZXRzKVxuICB9XG4gIGRhdGEucGxheWVycy5mb3JFYWNoKGFkZEluZGV4KVxuXG4gIGNvbnN0IGFjdGlvbnMgPSB7fVxuICAvLyBwcmVmbG9wXG4gIGRhdGEucGxheWVycy5zb3J0KGJ5UHJlZmxvcE9yZGVyKVxuICBhZGRTdHJlZXQoYWN0aW9ucywgJ3ByZWZsb3AnLCBkYXRhLnBsYXllcnMpXG5cbiAgLy8gZmxvcCwgdHVybiwgcml2ZXIsIHNob3dkb3duXG4gIGRhdGEucGxheWVycy5zb3J0KGJ5UG9zdGZsb3BPcmRlcilcbiAgYWRkU3RyZWV0KGFjdGlvbnMsICdmbG9wJywgZGF0YS5wbGF5ZXJzKVxuICBhZGRTdHJlZXQoYWN0aW9ucywgJ3R1cm4nLCBkYXRhLnBsYXllcnMpXG4gIGFkZFN0cmVldChhY3Rpb25zLCAncml2ZXInLCBkYXRhLnBsYXllcnMpXG4gIGFkZFN0cmVldChhY3Rpb25zLCAnc2hvd2Rvd24nLCBkYXRhLnBsYXllcnMpXG5cbiAgaGFuZC5hY3Rpb25zID0gYWN0aW9uc1xuICByZXR1cm4gaGFuZFxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IHB1dE1vbmV5SW4gPSB7XG4gICAgZm9sZCAgICA6IGZhbHNlXG4gICwgY2hlY2sgICA6IGZhbHNlXG4gICwgY29sbGVjdCA6IGZhbHNlXG4gICwgcG9zdCAgICA6IHRydWVcbiAgLCBjYWxsICAgIDogdHJ1ZVxuICAsIGJldCAgICAgOiB0cnVlXG4gICwgcmFpc2UgICA6IHRydWVcbn1cblxuY29uc3QgY2FyZHNPbkJvYXJkID0ge1xuICAgIHByZWZsb3AgIDogMFxuICAsIGZsb3AgICAgIDogM1xuICAsIHR1cm4gICAgIDogNFxuICAsIHJpdmVyICAgIDogNVxuICAsIHNob3dkb3duIDogNVxufVxuXG4vKipcbiAqIFRha2VzIGEgc2NyaXB0IG9mIGFjdGlvbnMgYW5kIGNhbGN1bGF0ZXMgdGhlIHN0YXRlcyBmb3IgZWFjaC5cbiAqIEFkZHMgcG9pbnRlcnMgdG8gdGhlIHN0YXRlIGF0IHRoZSBiZWdpbm5pbmcgb2YgZWFjaCBzY3JpcHQuXG4gKlxuICogVGhpcyBpcyB1c2VmdWwgaWYgeW91IHRyeSB0byBqdW1wIGFyb3VuZCBpbiB0aGUgaGFuZCBhbmQgcmVzZXRcbiAqIHRoZSBzdGF0ZSBvZiB0aGUgdGFibGUuXG4gKlxuICogQG5hbWUgaGhhOnN0b3J5Ym9hcmRcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtPYmplY3R9IHNjcmlwdCBjcmVhdGVkIHZpYSBAc2VlIGhoYTpzY3JpcHRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdG9yeWJvYXJkKHNjcmlwdCkge1xuICBjb25zdCBzdGF0ZXMgPSBbXVxuXG4gIC8vXG4gIC8vIGluaXRpYWxseVxuICAvL1xuICBmdW5jdGlvbiBnZXRWYWwoYWNjLCBrKSB7XG4gICAgaWYgKHNjcmlwdC5ib2FyZFtrXSkgYWNjLnB1c2goc2NyaXB0LmJvYXJkW2tdKVxuICAgIHJldHVybiBhY2NcbiAgfVxuXG4gIGNvbnN0IGJvYXJkID0gc2NyaXB0LmJvYXJkICYmIE9iamVjdC5rZXlzKHNjcmlwdC5ib2FyZCkucmVkdWNlKGdldFZhbCwgW10pIHx8IFtdXG5cbiAgLy8gd2lsbCBiZSBzcGFyc2UgaWYgbm90IGFsbCBwbGF5ZXJzIHByZXNlbnRcbiAgbGV0IHNlYXRzID0gbmV3IEFycmF5KHNjcmlwdC50YWJsZS5tYXhzZWF0cyArIDEpXG4gIGZ1bmN0aW9uIGFkZFNlYXQocCwgaWR4KSB7XG4gICAgc2VhdHNbcC5zZWF0bm9dID0ge1xuICAgICAgICBjaGlwcyAgICAgICA6IHAuY2hpcHNQcmVmbG9wXG4gICAgICAsIG5hbWUgICAgICAgIDogcC5uYW1lXG4gICAgICAsIG0gICAgICAgICAgIDogcC5tXG4gICAgICAsIHNiICAgICAgICAgIDogcC5zYlxuICAgICAgLCBiYiAgICAgICAgICA6IHAuYmJcbiAgICAgICwgYnV0dG9uICAgICAgOiBwLmJ1dHRvblxuICAgICAgLCBhY3Rpb24gICAgICA6IG51bGxcbiAgICAgICwgYW1vdW50ICAgICAgOiAwXG4gICAgICAsIGJldCAgICAgICAgIDogMFxuICAgICAgLCBpbnZlc3RlZEJldCA6IHAuYmIgPyAxIDogMFxuICAgICAgLCBob2xlY2FyZHMgICA6IHAuY2FyZHMgfHwgeyBjYXJkMSA6ICc/PycsIGNhcmQyIDogJz8/JyB9XG4gICAgICAsIHBsYXllcklkeCAgIDogaWR4XG4gICAgICAsIHNlYXRubyAgICAgIDogcC5zZWF0bm9cbiAgICB9XG4gIH1cbiAgc2NyaXB0LnBsYXllcnMuZm9yRWFjaChhZGRTZWF0KVxuXG4gIC8vXG4gIC8vIEZyb20gbm93IG9uIHdlIGFsd2F5cyBtYXAgc2VhdHMgZXZlbiB0aG91Z2ggd2UgcmV1c2UgdGhlIHZhcmlhYmxlXG4gIC8vIGluIG9yZGVyIHRvIGF2b2lkIGFmZmVjdGluZyBwcmV2aW91cyBzdGF0ZXNcbiAgLy9cblxuICBmdW5jdGlvbiByZXNldFNlYXQocykge1xuICAgIGNvbnN0IHN0cmVldCA9IHRoaXMuc3RyZWV0XG4gICAgY29uc3Qgc3RhZ2UgID0gdGhpcy5zdGFnZVxuXG4gICAgY29uc3QgcHJlZmxvcCA9IHN0cmVldCA9PT0gJ3ByZWZsb3AnXG4gICAgY29uc3QgY2hpcHNOYW1lID0gJ2NoaXBzJyArIHN0cmVldFswXS50b1VwcGVyQ2FzZSgpICsgc3RyZWV0LnNsaWNlKDEpXG4gICAgY29uc3QgcCA9IHNjcmlwdC5wbGF5ZXJzW3MucGxheWVySWR4XVxuICAgIGNvbnN0IGNoaXBzID0gcFtjaGlwc05hbWVdXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHNlYXRzW3Auc2VhdG5vXSwge1xuICAgICAgICBjaGlwcyAgICAgICA6IGNoaXBzXG4gICAgICAsIGFjdGlvbiAgICAgIDogbnVsbFxuICAgICAgLCBhbW91bnQgICAgICA6IDBcbiAgICAgICwgYmV0ICAgICAgICAgOiAwXG4gICAgICAsIGludmVzdGVkQmV0IDogcHJlZmxvcCAmJiBwLmJiID8gMSA6IDBcbiAgICAgICwgX2xhc3RVcGRhdGUgOiBzdGFnZVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBhZGFwdFNlYXQocywgaWR4KSB7XG4gICAgY29uc3QgcCA9IHRoaXMucFxuICAgIGNvbnN0IGEgPSB0aGlzLmFcbiAgICBjb25zdCBzdGFnZSA9IHRoaXMuc3RhZ2VcbiAgICBpZiAodHlwZW9mIHMgPT09ICd1bmRlZmluZWQnIHx8IHAuc2VhdG5vICE9PSBpZHgpIHJldHVybiBzXG5cbiAgICAvLyBjYXJkcyBhcmUgbm90IGF0IHBsYXllcidzIHNlYXQgYW55bW9yZSBhZnRlciBoZSBmb2xkZWRcbiAgICBjb25zdCBmb2xkZWQgPSBhLnR5cGUgPT09ICdmb2xkJ1xuICAgIGNvbnN0IGhvbGVjYXJkcyA9IGZvbGRlZCA/IG51bGwgOiBzLmhvbGVjYXJkc1xuICAgIGNvbnN0IGludmVzdGVkQmV0ID0gcHV0TW9uZXlJblthLnR5cGVdID8gYS5iZXQgOiBzLmludmVzdGVkQmV0XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHMsIHtcbiAgICAgICAgY2hpcHMgICAgICAgOiBhLmNoaXBzQWZ0ZXJcbiAgICAgICwgYWN0aW9uICAgICAgOiBhLnR5cGVcbiAgICAgICwgYW1vdW50ICAgICAgOiBhLmFtb3VudFxuICAgICAgLCBiZXQgICAgICAgICA6IGEuYmV0IHx8IDBcbiAgICAgICwgaW52ZXN0ZWRCZXQgOiBpbnZlc3RlZEJldCB8fCAwXG4gICAgICAsIGhvbGVjYXJkcyAgIDogaG9sZWNhcmRzXG4gICAgICAsIGZvbGRlZCAgICAgIDogZm9sZGVkXG4gICAgICAsIF9sYXN0VXBkYXRlIDogc3RhZ2VcbiAgICB9KVxuICB9XG5cbiAgbGV0IHN0cmVldElkeHMgPSB7XG4gICAgICBwcmVmbG9wICA6IG51bGxcbiAgICAsIGZsb3AgICAgIDogbnVsbFxuICAgICwgdHVybiAgICAgOiBudWxsXG4gICAgLCByaXZlciAgICA6IG51bGxcbiAgICAsIHNob3dkb3duIDogbnVsbFxuICB9XG5cbiAgY29uc3QgZm9sZGVkID0ge31cblxuICBmdW5jdGlvbiBhZGRGb2xkZWQoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWF0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcyA9IHNlYXRzW2ldXG4gICAgICBpZiAocyAmJiBzLmZvbGRlZCkgZm9sZGVkW3Muc2VhdG5vXSA9IHRydWVcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb2xsZWN0QWN0aW9uKHN0cmVldCkge1xuICAgIGNvbnN0IGZsb3AgPSBzdHJlZXQgPT09ICdmbG9wJ1xuICAgIGZ1bmN0aW9uIHRvY29sbGVjdChhY2MsIHMpIHtcbiAgICAgIGlmIChmb2xkZWRbcy5zZWF0bm9dKSByZXR1cm4gYWNjXG5cbiAgICAgIC8vIHNtYWxsIGJsaW5kcyBwb3N0ZWQgYW5kIHRoZWlyIGJldCBzaXplIGlzIDAgKGhhbGYgYSBibGluZClcbiAgICAgIC8vIGhvd2V2ZXIgaWYgdGhleSBpbnZlc3RlZCBtb3JlIHdlJ2xsIHVzZSB0aGF0IGFtb3VudFxuICAgICAgaWYgKHMuc2IgJiYgZmxvcCkge1xuICAgICAgICBhY2MucHVzaCh7IHNlYXRubzogcy5zZWF0bm8sIGJldDogcy5pbnZlc3RlZEJldCB8fCAwIH0pXG5cbiAgICAgIC8vIGJpZyBibGluZHMgbmVlZCB0byBoYXZlIHRoZWlyIGJpZyBibGluZCBjb2xsZWN0ZWQgYXQgbGVhc3RcbiAgICAgIH0gZWxzZSBpZiAocy5iYikge1xuICAgICAgICBhY2MucHVzaCh7IHNlYXRubzogcy5zZWF0bm8sIGJldDogTWF0aC5tYXgoMSwgKHMuaW52ZXN0ZWRCZXQgfHwgMCkpIH0pXG5cbiAgICAgIC8vIGFsbCBvdGhlcnMgaGF2ZSBubyBjaGlwcyBpbiBmcm9udCBvZiB0aGVtIGlmIHRoZXkgZGlkbid0IGludmVzdFxuICAgICAgfSBlbHNlIGlmIChzLmludmVzdGVkQmV0KSB7XG4gICAgICAgIGFjYy5wdXNoKHsgc2VhdG5vOiBzLnNlYXRubywgYmV0OiBzLmludmVzdGVkQmV0IH0pXG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjXG4gICAgfVxuXG4gICAgcmV0dXJuIHNlYXRzLnJlZHVjZSh0b2NvbGxlY3QsIFtdKVxuICB9XG5cbiAgZnVuY3Rpb24gd2l0aEhvbGVjYXJkcyh4KSB7XG4gICAgcmV0dXJuIHggJiYgISF4LmhvbGVjYXJkc1xuICB9XG5cbiAgZnVuY3Rpb24gaXNCdXR0b24oeCkge1xuICAgIHJldHVybiB4ICYmICEheC5idXR0b25cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNlYXRubyh4KSB7XG4gICAgcmV0dXJuIHguc2VhdG5vXG4gIH1cblxuICBmdW5jdGlvbiBnZXRTdGFnZShzdHJlZXQsIGkpIHtcbiAgICAvLyBhY2NvdW50IGZvciB0aGUgZmFjdCB0aGF0IHRoZSBmaXJzdCBzaG93ZG93biBzdGFnZSBhbHJlYWR5IGhhcyBhbiBhY3Rpb25cbiAgICBpZiAoc3RyZWV0ICE9PSAnc2hvd2Rvd24nKSByZXR1cm4gc3RyZWV0ICsgJysnICsgKGkgKyAxKVxuICAgIHJldHVybiBpID09PSAwID8gc3RyZWV0IDogc3RyZWV0ICsgJysnICsgaVxuICB9XG5cbiAgZnVuY3Rpb24gcHJvY2Vzc1N0cmVldChzdHJlZXQpIHtcbiAgICBjb25zdCBhY3Rpb25zID0gc2NyaXB0LmFjdGlvbnNbc3RyZWV0XVxuICAgIGNvbnN0IG9uYm9hcmQgPSBjYXJkc09uQm9hcmRbc3RyZWV0XSB8fCAwXG4gICAgY29uc3QgY3VycmVudEJvYXJkID0gYm9hcmQuc2xpY2UoMCwgb25ib2FyZClcbiAgICBjb25zdCBwcmVmbG9wID0gc3RyZWV0ID09PSAncHJlZmxvcCdcbiAgICBjb25zdCBzaG93ZG93biA9IHN0cmVldCA9PT0gJ3Nob3dkb3duJ1xuXG4gICAgLy8gY29sbGVjdCBjaGlwcyBmaXJzdCBpZiB3ZSBtYWRlIGl0IHRvIGZsb3AsIHR1cm4sIHJpdmVyIG9yIHNob3dkb3duXG4gICAgY29uc3QgY29sbGVjdCA9ICFwcmVmbG9wID8gY29sbGVjdEFjdGlvbigpIDogW11cbiAgICAvLyBtYXJrIGZvbGRlZCBwbGF5ZXJzIHNvIHdlIGRvbid0IGNvbGxlY3QgdGhlaXIgY2hpcHMgYWdhaW4gb24gbmV4dCBzdHJlZXRcbiAgICBhZGRGb2xkZWQoKVxuXG4gICAgc2VhdHMgPSBzZWF0cy5tYXAocmVzZXRTZWF0LCB7IHN0cmVldDogc3RyZWV0LCBzdGFnZTogc3RyZWV0IH0pXG4gICAgY29uc3QgZGVhbGVyQWN0aW9uID0ge1xuICAgICAgY29sbGVjdDogY29sbGVjdFxuICAgIH1cbiAgICBpZiAoIXByZWZsb3AgJiYgIXNob3dkb3duKSB7XG4gICAgICBkZWFsZXJBY3Rpb24uYm9hcmQgPSB7XG4gICAgICAgICAgc3RyZWV0OiBzdHJlZXRcbiAgICAgICAgLCBvbmJvYXJkOiBjYXJkc09uQm9hcmRbc3RyZWV0XVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcmVmbG9wKSB7XG4gICAgICBjb25zdCBidXR0b24gPSBzZWF0cy5maWx0ZXIoaXNCdXR0b24pLm1hcChnZXRTZWF0bm8pWzBdXG4gICAgICBkZWFsZXJBY3Rpb24uZGVhbHRDYXJkcyA9IHtcbiAgICAgICAgc2VhdG5vczogc2VhdHMuZmlsdGVyKHdpdGhIb2xlY2FyZHMpLm1hcChnZXRTZWF0bm8pXG4gICAgICB9XG4gICAgICBpZiAoYnV0dG9uKSB7XG4gICAgICAgIGRlYWxlckFjdGlvbi5idXR0b24gPSB7XG4gICAgICAgICAgc2VhdG5vOiBidXR0b25cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoaXMgc3RhdGUgaXMgaWRlbnRpY2FsIHRvIHRoZSBmaXJzdCBhY3Rpb24gb24gdGhlIHN0cmVldCwgZXhjZXB0IHRoZVxuICAgIC8vIGFjdGlvbiBoYXNuJ3QgZXhlY3V0ZWQuXG4gICAgLy8gVGh1cyBpdCBjbGVhcnMgdXAgYWxsIGNoaXBzIGluIGZyb250IG9mIHRoZSBwbGF5ZXJzIGFuZCBhZGRzIGNhcmRzXG4gICAgLy8gdG8gdGhlIGJvYXJkLlxuICAgIC8vIERvbid0IGNyZWF0ZSB0aGlzIGZvciB0aGUgc2hvd2Rvd24gdGhvdWdoIHNpbmNlIG5vdGhpbmcgdmlzaWJseSBjaGFuZ2VzIGhlcmVcbiAgICAvLyB1bnRpbCB0aGUgbmV4dCBwbGF5ZXIgYWN0aW9uIG9jY3Vycy5cbiAgICBpZiAoc3RyZWV0ICE9PSAnc2hvd2Rvd24nKSB7XG4gICAgICBzdGF0ZXMucHVzaCh7XG4gICAgICAgICAgYm9hcmQgICAgICAgIDogY3VycmVudEJvYXJkXG4gICAgICAgICwgYm9hcmRDaGFuZ2VkIDogdHJ1ZVxuICAgICAgICAsIHBvdCAgICAgICAgICA6IHNjcmlwdC5wb3RzW3N0cmVldF1cbiAgICAgICAgLCBhY3Rpb24gICAgICAgOiBmYWxzZVxuICAgICAgICAsIHN0YWdlICAgICAgICA6IHN0cmVldFxuICAgICAgICAsIHNlYXRzICAgICAgICA6IHNlYXRzXG4gICAgICAgICwgZGVhbGVyQWN0aW9uIDogZGVhbGVyQWN0aW9uXG4gICAgICB9KVxuICAgICAgc3RyZWV0SWR4c1tzdHJlZXRdID0gc3RhdGVzLmxlbmd0aCAtIDFcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gc2hvd2Rvd24gcG9pbnRzIHRvIGZpcnN0IGFjdGlvbiBpbiBpdFxuICAgICAgc3RyZWV0SWR4c1tzdHJlZXRdID0gc3RhdGVzLmxlbmd0aFxuICAgIH1cblxuICAgIGlmICghYWN0aW9ucy5sZW5ndGgpIHtcbiAgICAgIC8vIG1ha2Ugc3VyZSB3ZSBwbGF5IHRvIHNob3dkb3duIGluIGNhc2UgYWxsIHBsYXllcnMgYXJlIGFsbGluXG4gICAgICByZXR1cm4gY3VycmVudEJvYXJkLmxlbmd0aCA+PSBjYXJkc09uQm9hcmRbc3RyZWV0XVxuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYWN0aW9uID0gYWN0aW9uc1tpXVxuICAgICAgY29uc3QgcCA9IHNjcmlwdC5wbGF5ZXJzW2FjdGlvbi5wbGF5ZXJJbmRleF1cbiAgICAgIGNvbnN0IGEgPSBhY3Rpb24uYWN0aW9uXG4gICAgICBjb25zdCBzdGFnZSA9IGdldFN0YWdlKHN0cmVldCwgaSlcblxuICAgICAgc2VhdHMgPSBzZWF0cy5tYXAoYWRhcHRTZWF0LCB7IHA6IHAsIGE6IGEsIHN0YWdlOiBzdGFnZSB9KVxuICAgICAgYWN0aW9uLnNlYXRubyA9IHAuc2VhdG5vXG4gICAgICBjb25zdCBzdGF0ZSA9IHtcbiAgICAgICAgICBib2FyZCAgICAgICAgOiBjdXJyZW50Qm9hcmRcbiAgICAgICAgLCBib2FyZENoYW5nZWQgOiBmYWxzZVxuICAgICAgICAsIHBvdCAgICAgICAgICA6IHN0cmVldCA9PT0gJ3Nob3dkb3duJyA/IDAgOiBhLnBvdEFmdGVyXG4gICAgICAgICwgYWN0aW9uICAgICAgIDogYWN0aW9uXG4gICAgICAgICwgc3RhZ2UgICAgICAgIDogc3RhZ2VcbiAgICAgICAgLCBzZWF0cyAgICAgICAgOiBzZWF0c1xuICAgICAgfVxuICAgICAgLy8gZm9yIHNob3dkb3duIHdlIGNvbWJpbmUgdGhlIGRlYWxlciBhY3Rpb24gd2l0aCB3aGF0ZXZlclxuICAgICAgLy8gZWxzZSBpcyBnb2luZyBvbiwgaS5lLiB3aW5uZXIgY29sbGVjdGluZyBtb25leVxuICAgICAgaWYgKHN0cmVldCA9PT0gJ3Nob3dkb3duJykge1xuICAgICAgICAvLyByZXZlYWwgY2FyZHMgb24gbGFzdCBzaG93ZG93biBzdGF0ZVxuICAgICAgICBpZiAoaSA9PT0gYWN0aW9ucy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgZGVhbGVyQWN0aW9uLmhvbGVjYXJkcyA9IHtcbiAgICAgICAgICAgIHJldmVhbDogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgICBzdGF0ZS5kZWFsZXJBY3Rpb24gPSBkZWFsZXJBY3Rpb25cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc3RhdGVzLnB1c2goc3RhdGUpXG4gICAgfVxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBsZXQgbW9yZSA9IHByb2Nlc3NTdHJlZXQoJ3ByZWZsb3AnKVxuICBpZiAobW9yZSkgbW9yZSA9IHByb2Nlc3NTdHJlZXQoJ2Zsb3AnKVxuICBpZiAobW9yZSkgbW9yZSA9IHByb2Nlc3NTdHJlZXQoJ3R1cm4nKVxuICBpZiAobW9yZSkgbW9yZSA9IHByb2Nlc3NTdHJlZXQoJ3JpdmVyJylcbiAgaWYgKG1vcmUpIHByb2Nlc3NTdHJlZXQoJ3Nob3dkb3duJylcblxuICByZXR1cm4ge1xuICAgICAgaW5mbzogc2NyaXB0LmluZm9cbiAgICAsIHBsYXllcnM6IHNjcmlwdC5wbGF5ZXJzXG4gICAgLCBib2FyZDogc2NyaXB0LmJvYXJkXG4gICAgLCBzdGF0ZXM6IHN0YXRlc1xuICAgICwgc3RyZWV0czogc3RyZWV0SWR4c1xuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxuLy8gICAgICAgICAgICBbIGV4YWN0LCByYW5nZSBdXG5jb25zdCBzYiAgICAgPSBbICdzYicsICdzYicgXVxuY29uc3QgYmIgICAgID0gWyAnYmInLCAnYmInIF1cbmNvbnN0IGJ1ICAgICA9IFsgJ2J1JywgJ2J1JyBdXG5jb25zdCBjbyAgICAgPSBbICdjbycsICdjbycgXVxuY29uc3QgdXRnICAgID0gWyAndXRnJywgJ2VhJyBdXG5jb25zdCB1dGcxICAgPSBbICd1dGcrMScsICdlYScgXVxuY29uc3QgdXRnMiAgID0gWyAndXRnKzInLCAnZWEnIF1cbmNvbnN0IG1wMV9taSA9IFsgJ21wMScsICdtaScgXVxuY29uc3QgbXAyX21pID0gWyAnbXAyJywgJ21pJyBdXG5jb25zdCBtcDFfbHQgPSBbICdtcDEnLCAnbHQnIF1cbmNvbnN0IG1wMl9sdCA9IFsgJ21wMicsICdsdCcgXVxuY29uc3QgbXAzX2x0ID0gWyAnbXAzJywgJ2x0JyBdXG5cbi8vIDAgYmFzZWQgLi4gc3Vic3RyYWN0IDJcbmNvbnN0IHRhYmxlID0gW1xuICAgIC8vIGhlYWRzdXBcbiAgICBbIHNiLCBiYiBdXG4gICAgLy8gMyBwbGF5ZXJzXG4gICwgWyBidSwgc2IsIGJiIF1cbiAgICAvLyA0IHBsYXllcnNcbiAgLCBbIGNvLCBidSwgc2IsIGJiIF1cbiAgICAvLyA1IHBsYXllcnNcbiAgLCBbIHV0ZywgY28sIGJ1LCBzYiwgYmIgXVxuICAgIC8vIDYgcGxheWVyc1xuICAsIFsgdXRnLCB1dGcxLCBjbywgYnUsIHNiLCBiYiBdXG4gICAgLy8gNyBwbGF5ZXJzXG4gICwgWyB1dGcsIHV0ZzEsIG1wMV9sdCwgY28sIGJ1LCBzYiwgYmIgXVxuICAgIC8vIDggcGxheWVyc1xuICAsIFsgdXRnLCB1dGcxLCB1dGcyLCBtcDFfbHQsIGNvLCBidSwgc2IsIGJiIF1cbiAgICAvLyA5IHBsYXllcnNcbiAgLCBbIHV0ZywgdXRnMSwgdXRnMiwgbXAxX21pLCBtcDJfbHQsIGNvLCBidSwgc2IsIGJiIF1cbiAgICAvLyAxMCBwbGF5ZXJzXG4gICwgWyB1dGcsIHV0ZzEsIHV0ZzIsIG1wMV9taSwgbXAyX21pLCBtcDNfbHQsIGNvLCBidSwgc2IsIGJiIF1cbl1cblxuLy8gRGV0ZXJtaW5lZCAgYnkgbnVtYmVyIG9mIGFjdGl2ZSBwbGF5ZXJzIGF0IHRhYmxlXG4vLyB1c2luZyBhY3Rpbmcgb3JkZXIgcHJlZmxvcFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdHJhdGVnaWNQb3NpdGlvbnMob3JkZXIsIGFjdGl2ZVBsYXllcnMpIHtcbiAgY29uc3QgY2VsbCA9IHRhYmxlW2FjdGl2ZVBsYXllcnMgLSAyXVtvcmRlcl1cbiAgcmV0dXJuIHtcbiAgICAgIGV4YWN0UG9zOiBjZWxsWzBdXG4gICAgLCBwb3M6IGNlbGxbMV1cbiAgfVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBzdHJpbmdVdGlsID0gcmVxdWlyZSgnLi9saWIvdXRpbC9zdHJpbmcnKVxuXG5jb25zdCBob2xkZW1fcHMgPSByZXF1aXJlKCcuL2xpYi9ob2xkZW0vcG9rZXJzdGFycycpXG5cbmZ1bmN0aW9uIGdldExpbmVzKHR4dCkge1xuICBjb25zdCB0cmltbWVkID0gdHh0LnNwbGl0KCdcXG4nKS5tYXAoc3RyaW5nVXRpbC50cmltTGluZSlcbiAgd2hpbGUgKHRyaW1tZWRbMF0gJiYgIXRyaW1tZWRbMF0ubGVuZ3RoKSB0cmltbWVkLnNoaWZ0KClcbiAgcmV0dXJuIHRyaW1tZWRcbn1cblxuLyoqXG4gKiBQYXJzZXMgUG9rZXJIYW5kIEhpc3RvcmllcyBhcyBvdXRwdXQgYnkgdGhlIGdpdmVuIG9ubGluZSBQb2tlciBSb29tcy5cbiAqIEF1dG9kZXRlY3RzIHRoZSBnYW1lIHR5cGUgYW5kIHRoZSBQb2tlclJvb20uXG4gKiBTbyBmYXIgUG9rZXJTdGFycyBIb2xkZW0gaGFuZHMgYXJlIHN1cHBvcnRlZC5cbiAqXG4gKiBUaGUgcGFyc2VkIGhhbmRzIGNhbiB0aGVuIGJlIGZ1cnRoZXIgYW5hbHl6ZWQgd2l0aCB0aGVcbiAqIFtoaGFdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaGEpIG1vZHVsZS5cbiAqXG4gKiBBcyBhbiBleGFtcGxlIFt0aGlzXG4gKiBoYW5kXShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGhwL2Jsb2IvbWFzdGVyL3Rlc3QvZml4dHVyZXMvaG9sZGVtL3Bva2Vyc3RhcnMvYWN0aW9ub25hbGwudHh0KVxuICogaXMgcGFyc2VkIGludG8gW3RoaXMgb2JqZWN0XG4gKiByZXByZXNlbnRhdGlvbl0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hoYS9ibG9iL21hc3Rlci90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uKS5cbiAqXG4gKiBAbmFtZSBwYXJzZVxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gaW5wdXQgdGhlIHRleHR1YWwgcmVwcmVzZW50YXRpb24gb2Ygb25lIHBva2VyIGhhbmQgYXMgd3JpdHRlbiB0byB0aGUgSGFuZEhpc3RvcnkgZm9sZGVyXG4gKiBAcGFyYW0ge29iamVjdH0gb3B0cyB2YXJpb3VzIG9wdGlvbnNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gb3B0cy5pbmZvT25seSBkZW5vdGVzIHRoYXQgb25seSB0aGUgaGVhZGVyIGxpbmUgb2YgdGhlIGhhbmQgaXMgcGFyc2VkIGFuZCBvbmx5IHRoZSBpbmZvIG9iamVjdCByZXR1cm5lZFxuICogQHJldHVybiB7b2JqZWN0fSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gaGFuZCB0byBiZSB1c2VkIGFzIGlucHV0IGZvciBvdGhlciB0b29scyBsaWtlIGhoYVxuICovXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZShpbnB1dCwgb3B0cykge1xuICBjb25zdCBsaW5lcyA9IEFycmF5LmlzQXJyYXkoaW5wdXQpID8gaW5wdXQgOiBnZXRMaW5lcyhpbnB1dCkuZmlsdGVyKHN0cmluZ1V0aWwuZW1wdHlMaW5lKVxuICBpZiAoaG9sZGVtX3BzLmNhblBhcnNlKGxpbmVzKSkgcmV0dXJuIGhvbGRlbV9wcy5wYXJzZShsaW5lcywgb3B0cylcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBhbGwgaGFuZHMgZnJvbSBhIGdpdmVuIHRleHQgZmlsZS5cbiAqXG4gKiBAbmFtZSBleHRyYWN0SGFuZHNcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IHR4dCB0aGUgdGV4dCBjb250YWluaW5nIHRoZSBoYW5kc1xuICogQHJldHVybiB7QXJyYXkuPEFycmF5Pn0gYW4gYXJyYXkgb2YgaGFuZHMsIGVhY2ggaGFuZCBzcGxpdCBpbnRvIGxpbmVzXG4gKi9cbmV4cG9ydHMuZXh0cmFjdEhhbmRzID0gZnVuY3Rpb24gZXh0cmFjdEhhbmRzKHR4dCkge1xuICBjb25zdCBsaW5lcyA9IGdldExpbmVzKHR4dClcbiAgY29uc3QgaGFuZHMgPSBbXVxuICBsZXQgaGFuZCA9IFtdXG5cbiAgbGV0IGkgPSAwXG4gIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldICYmICFsaW5lc1tpXS5sZW5ndGgpIGkrKyAgIC8vIGlnbm9yZSBsZWFkaW5nIGVtcHR5IGxpbmVzXG4gIGZvciAoOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV1cbiAgICBpZiAobGluZS5sZW5ndGgpIHtcbiAgICAgIGhhbmQucHVzaChsaW5lKVxuICAgICAgLy8gbGFzdCBoYW5kIHRoYXQncyBub3QgZm9sbG93ZWQgYnkgZW1wdHkgbGluZVxuICAgICAgaWYgKGkgPT09IGxpbmVzLmxlbmd0aCAtIDEgJiYgaGFuZC5sZW5ndGgpIGhhbmRzLnB1c2goaGFuZClcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaGFuZCBmaW5pc2hlZFxuICAgICAgaWYgKGhhbmQubGVuZ3RoKSBoYW5kcy5wdXNoKGhhbmQpXG4gICAgICBoYW5kID0gW11cbiAgICAgIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldICYmICFsaW5lc1tpXS5sZW5ndGgpIGkrKyAgLy8gZmluZCBzdGFydCBvZiBuZXh0IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGhhbmRzXG59XG5cbi8vIFRlc3RcblxuZnVuY3Rpb24gaW5zcGVjdChvYmosIGRlcHRoKSB7XG4gIGNvbnNvbGUuZXJyb3IocmVxdWlyZSgndXRpbCcpLmluc3BlY3Qob2JqLCBmYWxzZSwgZGVwdGggfHwgNSwgdHJ1ZSkpXG59XG5cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuICAvLyBjb25zdCBuYW1lID0gJ2FsbGluLXByZWZsb3AnXG4gIC8vIGNvbnN0IG5hbWUgPSAnYWN0aW9ub25hbGwnXG4gIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKVxuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG4gIC8vIGNvbnN0IGZpeHR1cmVzID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaG9sZGVtJylcbiAgY29uc3QgYWxsaGFuZHMgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKF9fZGlybmFtZSwgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaGFuZHMudHh0JyksICd1dGY4JylcbiAgY29uc3QgcmVzID0gZXhwb3J0cy5leHRyYWN0SGFuZHMoYWxsaGFuZHMpXG4gIGluc3BlY3QocmVzKVxuICAvKiBjb25zdCBoaGFfZml4dHVyZXMgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4nLCAnaGhhJywgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaG9sZGVtJylcbiAgY29uc3QgdHh0ID0gZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihmaXh0dXJlcywgJ3Bva2Vyc3RhcnMnLCBuYW1lICsgJy50eHQnKSwgJ3V0ZjgnKVxuXG4gIGNvbnN0IHJlcyA9IG1vZHVsZS5leHBvcnRzKHR4dClcbiAgaW5zcGVjdChyZXMpXG4gIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGhoYV9maXh0dXJlcywgbmFtZSArICcuanNvbicpLFxuICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHJlcywgbnVsbCwgMiksXG4gICAgICAgICAgICAgICAgICAgJ3V0ZjgnKSovXG59XG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IHN0cmluZ1V0aWwgICAgID0gcmVxdWlyZSgnLi4vdXRpbC9zdHJpbmcnKVxuY29uc3Qgc2FmZVBhcnNlSW50ICAgPSBzdHJpbmdVdGlsLnNhZmVQYXJzZUludFxuY29uc3Qgc2FmZVBhcnNlRmxvYXQgPSBzdHJpbmdVdGlsLnNhZmVQYXJzZUZsb2F0XG5jb25zdCBzYWZlVHJpbSAgICAgICA9IHN0cmluZ1V0aWwuc2FmZVRyaW1cbmNvbnN0IHNhZmVMb3dlciAgICAgID0gc3RyaW5nVXRpbC5zYWZlTG93ZXJcbmNvbnN0IHNhZmVVcHBlciAgICAgID0gc3RyaW5nVXRpbC5zYWZlVXBwZXJcbmNvbnN0IHNhZmVGaXJzdFVwcGVyID0gc3RyaW5nVXRpbC5zYWZlRmlyc3RVcHBlclxuXG5mdW5jdGlvbiBIYW5kSGlzdG9yeVBhcnNlcihsaW5lcywgb3B0cykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSGFuZEhpc3RvcnlQYXJzZXIpKSByZXR1cm4gbmV3IEhhbmRIaXN0b3J5UGFyc2VyKGxpbmVzLCBvcHRzKVxuXG4gIHRoaXMuX2xpbmVzID0gbGluZXNcbiAgdGhpcy5faW5mb09ubHkgPSBvcHRzICYmIG9wdHMuaW5mb09ubHlcblxuICB0aGlzLl9wb3N0ZWQgICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1ByZWZsb3AgID0gZmFsc2VcbiAgdGhpcy5fc2F3RmxvcCAgICAgPSBmYWxzZVxuICB0aGlzLl9zYXdUdXJuICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1JpdmVyICAgID0gZmFsc2VcbiAgdGhpcy5fc2F3U2hvd2Rvd24gPSBmYWxzZVxuICB0aGlzLl9zYXdTdW1tYXJ5ICA9IGZhbHNlXG5cbiAgdGhpcy5oYW5kID0ge1xuICAgICAgc2VhdHMgICAgOiBbXVxuICAgICwgcG9zdHMgICAgOiBbXVxuICAgICwgcHJlZmxvcCAgOiBbXVxuICAgICwgZmxvcCAgICAgOiBbXVxuICAgICwgdHVybiAgICAgOiBbXVxuICAgICwgcml2ZXIgICAgOiBbXVxuICAgICwgc2hvd2Rvd24gOiBbXVxuICB9XG59XG5cbnZhciBwcm90byA9IEhhbmRIaXN0b3J5UGFyc2VyLnByb3RvdHlwZVxucHJvdG8uX2dhbWVUeXBlICAgICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9oYW5kSW5mb1J4ICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fdGFibGVJbmZvUnggICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX3NlYXRJbmZvUnggICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9wb3N0UnggICAgICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IHVuZGVmaW5lZFxucHJvdG8uX3N0cmVldEluZGljYXRvclJ4ICAgPSB1bmRlZmluZWRcbnByb3RvLl9zaG93ZG93bkluZGljYXRvclJ4ID0gdW5kZWZpbmVkXG5wcm90by5fc3VtbWFyeUluZGljYXRvclJ4ICA9IHVuZGVmaW5lZFxucHJvdG8uX2hvbGVjYXJkc1J4ICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9hY3Rpb25SeCAgICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fY29sbGVjdFJ4ICAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX2JldFJldHVybmVkUnggICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9zaG93UnggICAgICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fYm9hcmRSeCAgICAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX211Y2tSeCAgICAgICAgICAgICAgPSB1bmRlZmluZWRcblxucHJvdG8uX3ByZWZsb3BJbmRpY2F0b3IgPSBmdW5jdGlvbiBfcHJlZmxvcEluZGljYXRvcihsaW5lLCBsaW5lbm8pIHtcbiAgcmV0dXJuIHRoaXMuX3ByZWZsb3BJbmRpY2F0b3JSeC50ZXN0KGxpbmUpXG59XG5cbnByb3RvLl9zaG93ZG93bkluZGljYXRvciA9IGZ1bmN0aW9uIF9zaG93ZG93bkluZGljYXRvcihsaW5lLCBsaW5lbm8pIHtcbiAgcmV0dXJuIHRoaXMuX3Nob3dkb3duSW5kaWNhdG9yUngudGVzdChsaW5lKVxufVxuXG5wcm90by5fc3VtbWFyeUluZGljYXRvciA9ICBmdW5jdGlvbiBfc3VtbWFyeUluZGljYXRvcihsaW5lLCBsaW5lbm8pIHtcbiAgcmV0dXJuIHRoaXMuX3N1bW1hcnlJbmRpY2F0b3JSeC50ZXN0KGxpbmUpXG59XG5cbnByb3RvLl9pZGVudGlmeVBva2VyVHlwZSA9IGZ1bmN0aW9uIF9pZGVudGlmeVBva2VyVHlwZShzKSB7XG4gIGlmICh0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybiB1bmRlZmluZWRcbiAgcmV0dXJuICAoL2hvbGQnP2VtL2kpLnRlc3QocykgPyAnaG9sZGVtJ1xuICAgICAgICA6ICgvb21haGEvaSkudGVzdChzKSAgICA/ICdvbWFoYSdcbiAgICAgICAgOiAnbm90IHlldCBzdXBwb3J0ZWQnXG59XG5cbnByb3RvLl9pZGVudGlmeUxpbWl0ID0gZnVuY3Rpb24gX2lkZW50aWZ5TGltaXQocykge1xuICBpZiAodHlwZW9mIHMgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gdW5kZWZpbmVkXG5cbiAgcmV0dXJuICAoLyhubyA/bGltaXR8bmwpL2kpLnRlc3QocykgID8gJ25vbGltaXQnXG4gICAgICAgIDogKC8ocG90ID9saW1pdHxwbCkvaSkudGVzdChzKSA/ICdwb3RsaW1pdCdcbiAgICAgICAgOiAnbm90IHlldCBzdXBwb3J0ZWQnXG59XG5cbnByb3RvLl9yZWFkSW5mbyA9IGZ1bmN0aW9uIF9yZWFkSW5mbyhsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgZ2FtZVR5cGUgICA9IHRoaXMuX2dhbWVUeXBlKClcbiAgY29uc3QgaGFuZEluZm8gICA9IHRoaXMuX2hhbmRJbmZvUngoZ2FtZVR5cGUpXG4gIGNvbnN0IGhhbmRJbmZvUnggPSBoYW5kSW5mby5yeFxuICBjb25zdCBpZHhzICAgICAgID0gaGFuZEluZm8uaWR4c1xuICBjb25zdCBtYXRjaCAgICAgID0gbGluZS5tYXRjaChoYW5kSW5mb1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICB0aGlzLmhhbmQuaW5mbyA9IHtcbiAgICAgIHJvb20gICAgICA6IHNhZmVMb3dlcihtYXRjaFtpZHhzLnJvb21dKVxuICAgICwgaGFuZGlkICAgIDogbWF0Y2hbaWR4cy5oYW5kaWRdXG4gICAgLCBnYW1ldHlwZSAgOiBnYW1lVHlwZVxuICAgICwgY3VycmVuY3kgIDogbWF0Y2hbaWR4cy5jdXJyZW5jeV1cbiAgICAsIHBva2VydHlwZSA6IHRoaXMuX2lkZW50aWZ5UG9rZXJUeXBlKG1hdGNoW2lkeHMucG9rZXJ0eXBlXSlcbiAgICAsIGxpbWl0ICAgICA6IHRoaXMuX2lkZW50aWZ5TGltaXQobWF0Y2hbaWR4cy5saW1pdF0pXG4gICAgLCBzYiAgICAgICAgOiBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHhzLnNiXSlcbiAgICAsIGJiICAgICAgICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoW2lkeHMuYmJdKVxuICAgICwgeWVhciAgICAgIDogc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMueWVhcl0pXG4gICAgLCBtb250aCAgICAgOiBzYWZlUGFyc2VJbnQobWF0Y2hbaWR4cy5tb250aF0pXG4gICAgLCBkYXkgICAgICAgOiBzYWZlUGFyc2VJbnQobWF0Y2hbaWR4cy5kYXldKVxuICAgICwgaG91ciAgICAgIDogc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMuaG91cl0pXG4gICAgLCBtaW4gICAgICAgOiBzYWZlUGFyc2VJbnQobWF0Y2hbaWR4cy5taW5dKVxuICAgICwgc2VjICAgICAgIDogc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMuc2VjXSlcbiAgICAsIHRpbWV6b25lICA6IHNhZmVVcHBlcihtYXRjaFtpZHhzLnRpbWV6b25lXSlcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuXG4gIGlmIChpZHhzLmRvbmF0aW9uICYmIGlkeHMucmFrZSkge1xuICAgIGNvbnN0IGRvbmF0aW9uID0gc2FmZVBhcnNlRmxvYXQobWF0Y2hbaWR4cy5kb25hdGlvbl0pXG4gICAgY29uc3QgcmFrZSAgICAgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFtpZHhzLnJha2VdKVxuXG4gICAgdGhpcy5oYW5kLmluZm8uZG9uYXRpb24gID0gc2FmZVBhcnNlRmxvYXQoZG9uYXRpb24pXG4gICAgdGhpcy5oYW5kLmluZm8ucmFrZSAgICAgID0gc2FmZVBhcnNlRmxvYXQocmFrZSlcbiAgICB0aGlzLmhhbmQuaW5mby5idXlpbiAgICAgPSBkb25hdGlvbiArIHJha2VcbiAgfVxuICBpZiAoaWR4cy5nYW1lbm8pIHtcbiAgICB0aGlzLmhhbmQuaW5mby5nYW1lbm8gPSBtYXRjaFtpZHhzLmdhbWVub11cbiAgfVxuXG4gIGlmIChpZHhzLmxldmVsKSB7XG4gICAgdGhpcy5oYW5kLmluZm8ubGV2ZWwgPSBzYWZlTG93ZXIobWF0Y2hbaWR4cy5sZXZlbF0pXG4gIH1cblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFRhYmxlID0gZnVuY3Rpb24gX3JlYWRUYWJsZShsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgZ2FtZVR5cGUgPSB0aGlzLl9nYW1lVHlwZSgpXG4gIGNvbnN0IHRhYmxlICAgID0gdGhpcy5fdGFibGVSeChnYW1lVHlwZSlcbiAgY29uc3QgdGFibGVSeCAgPSB0YWJsZS5yeFxuICBjb25zdCBpZHhzICAgICA9IHRhYmxlLmlkeHNcbiAgY29uc3QgbWF0Y2ggICAgPSBsaW5lLm1hdGNoKHRhYmxlUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIGNvbnN0IHRhYmxlbm8gID0gZ2FtZVR5cGUgPT09ICd0b3VybmFtZW50J1xuICAgID8gc2FmZVBhcnNlSW50KG1hdGNoW2lkeHMudGFibGVub10pXG4gICAgOiBtYXRjaFtpZHhzLnRhYmxlbm9dXG4gIHRoaXMuaGFuZC50YWJsZSA9IHtcbiAgICAgIHRhYmxlbm8gIDogdGFibGVub1xuICAgICwgbWF4c2VhdHMgOiBzYWZlUGFyc2VJbnQobWF0Y2hbaWR4cy5tYXhzZWF0c10pXG4gICAgLCBidXR0b24gICA6IHNhZmVQYXJzZUludChtYXRjaFtpZHhzLmJ1dHRvbl0pXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRTZWF0ID0gZnVuY3Rpb24gX3JlYWRTZWF0KGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc2VhdEluZm9SeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgdGhpcy5oYW5kLnNlYXRzLnB1c2goe1xuICAgICAgc2VhdG5vOiBzYWZlUGFyc2VJbnQobWF0Y2hbMV0pXG4gICAgLCBwbGF5ZXI6IG1hdGNoWzJdLnRyaW0oKVxuICAgICwgY2hpcHM6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzNdKVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9KVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcG9zdFR5cGUgPSBmdW5jdGlvbiBfcG9zdFR5cGUocykge1xuICByZXR1cm4gIHMgPT09ICdhbnRlJyA/ICAnYW50ZSdcbiAgICAgICAgOiBzID09PSAnYmlnIGJsaW5kJyA/ICdiYidcbiAgICAgICAgOiBzID09PSAnc21hbGwgYmxpbmQnID8gJ3NiJ1xuICAgICAgICA6ICd1bmtub3duJ1xufVxuXG5wcm90by5fcmVhZFBvc3QgPSBmdW5jdGlvbiBfcmVhZFBvc3QobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9wb3N0UngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIGNvbnN0IHR5cGUgICA9IHRoaXMuX3Bvc3RUeXBlKG1hdGNoWzJdKVxuICBjb25zdCBhbW91bnQgPSBzYWZlUGFyc2VGbG9hdChtYXRjaFszXSlcblxuICB0aGlzLmhhbmQucG9zdHMucHVzaCh7XG4gICAgICBwbGF5ZXI6IG1hdGNoWzFdXG4gICAgLCB0eXBlOiB0eXBlXG4gICAgLCBhbW91bnQ6IGFtb3VudFxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9KVxuICBpZiAodHlwZSA9PT0gJ2FudGUnICYmICF0aGlzLmhhbmQuaW5mby5hbnRlKSB0aGlzLmhhbmQuaW5mby5hbnRlID0gYW1vdW50XG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkSG9sZUNhcmRzID0gZnVuY3Rpb24gX3JlYWRIb2xlQ2FyZHMobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9ob2xlY2FyZHNSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgdGhpcy5oYW5kLmhlcm8gPSBtYXRjaFsxXVxuICB0aGlzLmhhbmQuaG9sZWNhcmRzID0ge1xuICAgICAgY2FyZDE6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzJdKSlcbiAgICAsIGNhcmQyOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRTdHJlZXQgPSBmdW5jdGlvbiBfcmVhZFN0cmVldChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3N0cmVldEluZGljYXRvclJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICB0aGlzLmhhbmQuYm9hcmQgPSB7XG4gICAgICBjYXJkMTogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgICwgY2FyZDI6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgICAsIGNhcmQzOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFs0XSkpXG4gICAgLCBjYXJkNDogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNV0pKVxuICAgICwgY2FyZDU6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzZdKSlcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICBpZiAobWF0Y2hbMV0gPT09ICdGTE9QJykgdGhpcy5fc2F3RmxvcCA9IHRydWVcbiAgaWYgKG1hdGNoWzFdID09PSAnVFVSTicpIHtcbiAgICB0aGlzLl9zYXdUdXJuID0gdHJ1ZVxuICAgIHRoaXMuaGFuZC5ib2FyZC5jYXJkNCA9IHRoaXMuaGFuZC5ib2FyZC5jYXJkNVxuICAgIHRoaXMuaGFuZC5ib2FyZC5jYXJkNSA9IHVuZGVmaW5lZFxuICB9XG4gIGlmIChtYXRjaFsxXSA9PT0gJ1JJVkVSJykgdGhpcy5fc2F3Uml2ZXIgPSB0cnVlXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9yZWFkU2hvdyA9ICBmdW5jdGlvbiBfcmVhZFNob3cobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zaG93UngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBtYXRjaFsxXVxuICAgICwgdHlwZSAgICA6ICdzaG93J1xuICAgICwgY2FyZDEgICA6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzJdKSlcbiAgICAsIGNhcmQyICAgOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBkZXNjICAgIDogbWF0Y2hbNF1cbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICB0aGlzLmhhbmQuc2hvd2Rvd24ucHVzaChhY3Rpb24pXG5cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRNdWNrID0gZnVuY3Rpb24gX3JlYWRNdWNrKGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fbXVja1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICBwbGF5ZXIgOiBtYXRjaFsxXVxuICAgICwgdHlwZSAgIDogJ211Y2snXG4gICAgLCBjYXJkMSAgOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFsyXSkpXG4gICAgLCBjYXJkMiAgOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgdGhpcy5oYW5kLnNob3dkb3duLnB1c2goYWN0aW9uKVxufVxuXG5wcm90by5fcmVhZEJvYXJkID0gZnVuY3Rpb24gX3JlYWRCb2FyZChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX2JvYXJkUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIHRoaXMuaGFuZC5ib2FyZCA9IHtcbiAgICAgIGNhcmQxOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFsxXSkpXG4gICAgLCBjYXJkMjogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgICwgY2FyZDM6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgICAsIGNhcmQ0OiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFs0XSkpXG4gICAgLCBjYXJkNTogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNV0pKVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFjdGlvblR5cGUocykge1xuICByZXR1cm4gcy5yZXBsYWNlKC8oZWR8cykkLywgJycpXG59XG5cbnByb3RvLl9yZWFkQWN0aW9uID0gZnVuY3Rpb24gX3JlYWRBY3Rpb24obGluZSwgbGluZW5vKSB7XG4gIGlmICh0aGlzLl9yZWFkQmV0UmV0dXJuZWQobGluZSwgbGluZW5vKSkgcmV0dXJuIHRydWVcblxuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fYWN0aW9uUngpIHx8IGxpbmUubWF0Y2godGhpcy5fY29sbGVjdFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm4gZmFsc2VcblxuICBjb25zdCB0eXBlID0gYWN0aW9uVHlwZShtYXRjaFsyXSlcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IG1hdGNoWzFdXG4gICAgLCB0eXBlICAgIDogdHlwZVxuICAgICwgYW1vdW50ICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzNdKVxuICB9XG4gIGlmICh0eXBlID09PSAncmFpc2UnKSB7XG4gICAgYWN0aW9uLnJhaXNlVG8gPSBzYWZlUGFyc2VGbG9hdChtYXRjaFs0XSlcbiAgICBhY3Rpb24uYWxsaW4gPSAhIW1hdGNoWzVdXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NhbGwnIHx8IHR5cGUgPT09ICdiZXQnKSB7XG4gICAgYWN0aW9uLmFsbGluID0gISFtYXRjaFs1XVxuICB9XG5cbiAgYWN0aW9uLm1ldGFkYXRhID0ge1xuICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAsIHJhdzogbGluZVxuICB9XG5cbiAgdGhpcy5fYWRkQWN0aW9uKGFjdGlvbiwgbGluZSwgbGluZW5vKVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZEJldFJldHVybmVkID0gZnVuY3Rpb24gX3JlYWRCZXRSZXR1cm5lZChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX2JldFJldHVybmVkUngpXG4gIGlmICghbWF0Y2gpIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgIHBsYXllciAgOiBtYXRjaFsyXVxuICAgICwgdHlwZSAgICA6ICdiZXQtcmV0dXJuZWQnXG4gICAgLCBhbW91bnQgIDogc2FmZVBhcnNlRmxvYXQobWF0Y2hbMV0pXG4gIH1cblxuICB0aGlzLl9hZGRBY3Rpb24oYWN0aW9uLCBsaW5lLCBsaW5lbm8pXG4gIHJldHVybiB0cnVlXG59XG5cbnByb3RvLl9hZGRBY3Rpb24gPSBmdW5jdGlvbiBfYWRkQWN0aW9uKGFjdGlvbiwgbGluZSwgbGluZW5vKSB7XG4gIGFjdGlvbi5tZXRhZGF0YSA9IHtcbiAgICAgIGxpbmVubzogbGluZW5vXG4gICAgLCByYXc6IGxpbmVcbiAgfVxuICBpZiAodGhpcy5fc2F3U2hvd2Rvd24pIHtcbiAgICB0aGlzLmhhbmQuc2hvd2Rvd24ucHVzaChhY3Rpb24pXG4gIH0gZWxzZSBpZiAodGhpcy5fc2F3Uml2ZXIpIHtcbiAgICB0aGlzLmhhbmQucml2ZXIucHVzaChhY3Rpb24pXG4gIH0gZWxzZSBpZiAodGhpcy5fc2F3VHVybikge1xuICAgIHRoaXMuaGFuZC50dXJuLnB1c2goYWN0aW9uKVxuICB9IGVsc2UgaWYgKHRoaXMuX3Nhd0Zsb3ApIHtcbiAgICB0aGlzLmhhbmQuZmxvcC5wdXNoKGFjdGlvbilcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmhhbmQucHJlZmxvcC5wdXNoKGFjdGlvbilcbiAgfVxufVxuXG5wcm90by5wYXJzZSA9IGZ1bmN0aW9uIHBhcnNlKCkge1xuICB0aGlzLl9jYWNoZWRHYW1lVHlwZSA9IG51bGxcbiAgY29uc3QgbGluZXMgPSB0aGlzLl9saW5lc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHRoaXMuX3Nhd1N1bW1hcnkpIHtcbiAgICAgIGlmICh0aGlzLl9yZWFkQm9hcmQobGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgICAgaWYgKHRoaXMuX3JlYWRNdWNrKGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc2F3U3VtbWFyeSA9IHRoaXMuX3N1bW1hcnlJbmRpY2F0b3IobGluZXNbaV0sIGkpXG4gICAgICBpZiAodGhpcy5fc2F3U3VtbWFyeSkgY29udGludWVcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc2F3U2hvd2Rvd24pIHtcbiAgICAgIGlmICh0aGlzLl9yZWFkU2hvdyhsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Nhd1Nob3dkb3duID0gdGhpcy5fc2hvd2Rvd25JbmRpY2F0b3IobGluZXNbaV0sIGkpXG4gICAgICBpZiAodGhpcy5fc2F3U2hvd2Rvd24pIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3Nhd1ByZWZsb3ApIHtcbiAgICAgIGlmICghdGhpcy5fc2F3RmxvcCAmJiAhdGhpcy5oYW5kLmhvbGVjYXJkcykge1xuICAgICAgICBpZiAodGhpcy5fcmVhZEhvbGVDYXJkcyhsaW5lc1tpXSwgaSkpIHtcbiAgICAgICAgICB0aGlzLl9zYXdQcmVmbG9wID0gdHJ1ZVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLl9yZWFkU3RyZWV0KGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkQWN0aW9uKGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc2F3UHJlZmxvcCA9IHRoaXMuX3ByZWZsb3BJbmRpY2F0b3IobGluZXNbaV0sIGkpXG4gICAgICBpZiAodGhpcy5fc2F3UHJlZmxvcCkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkUG9zdChsaW5lc1tpXSwgaSkpIHtcbiAgICAgICAgdGhpcy5fcG9zdGVkID0gdHJ1ZVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghdGhpcy5fcG9zdGVkKSB7XG4gICAgICBpZiAoIXRoaXMuaGFuZC5pbmZvKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZWFkSW5mbyhsaW5lc1tpXSwgaSkpIHtcbiAgICAgICAgICAvLyBpbiBzb21lIGNhc2VzIChyaWdodCBub3cgb25seSBmb3IgdGVzdHMpIHdlIGFyZSBvbmx5IGludGVyZXN0ZWRcbiAgICAgICAgICAvLyBpbiB0aGUgdG91cm5hbWVudCBvciBjYXNoIGdhbWUgaW5mbyAoaS5lLiB0aGUgZmlyc3QgbGluZSlcbiAgICAgICAgICBpZiAodGhpcy5faW5mb09ubHkpIHJldHVybiB0aGlzLmhhbmQuaW5mb1xuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICghdGhpcy5oYW5kLnRhYmxlKSAgaWYgKHRoaXMuX3JlYWRUYWJsZShsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgICBpZiAodGhpcy5fcmVhZFNlYXQobGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcy5oYW5kXG59XG5cbnByb3RvLmNhblBhcnNlID0gZnVuY3Rpb24gY2FuUGFyc2UoKSB7XG4gIHJldHVybiB0aGlzLl9nYW1lVHlwZSgpICE9IG51bGxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIYW5kSGlzdG9yeVBhcnNlclxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCByb29tR2FtZUlEID1cbiAgLy8gUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5OTI1NDg6XG4gIC8vIFBva2VyU3RhcnMgWm9vbSBIYW5kICMxNjQxODE3NjkwMzM6XG4gICdeKFBva2VyU3RhcnMpICg/Olpvb20gKT8oPzpIYW5kfEdhbWUpICMoXFxcXGQrKTogKydcblxuY29uc3QgdG91cm5hbWVudElEID1cbiAgLy8gVG91cm5hbWVudCAjMTQ5NTE5MjYzMCxcbiAgJ1RvdXJuYW1lbnQgIyhcXFxcZCspLCAnXG5cbmNvbnN0IHRvdXJuYW1lbnRCdXlJbiA9XG4gIC8vICQwLjkxKyQwLjA5XG4gICcoWyR84oKsXSkoKD86W1xcXFxkXStcXFxcLlxcXFxkKyl8KD86W1xcXFxkXSspKVxcXFwrKFskfOKCrF0pKCg/OltcXFxcZF0rXFxcXC5cXFxcZCspfCg/OltcXFxcZF0rKSkuKydcblxuY29uc3QgY2FzaEdhbWVCbGluZHMgPVxuICAvLyAoJDAuMDIvJDAuMDUpXG4gICdcXFxcKChbJHzigqxdKShbXi9dKylcXFxcL1skfOKCrF0oW14pXSspXFxcXCknXG5cbmNvbnN0IHBva2VyVHlwZSA9XG4gIC8vIFVTRCBIb2xkJ2VtIE5vIExpbWl0IC1cbiAgJyhIb2xkXFwnZW0pICsoTm8gTGltaXQpIC0/IConXG5cbmNvbnN0IHRvdXJuYW1lbnRMZXZlbCA9XG4gIC8vIExldmVsIFhJICg0MDAvODAwKVxuICAnTGV2ZWwgKFteKF0rKVxcXFwoKFteL10rKS8oW14pXSspXFxcXCkoPzogLSApezAsMX0nXG5cbmNvbnN0IGRhdGUgPVxuICAvLyAyMDE2LzAzLzAxXG4gICdbXlxcXFxkXSooXFxcXGR7NH0pLihcXFxcZHsyfSkuKFxcXFxkezJ9KSdcblxuY29uc3QgdGltZSA9XG4gIC8vIDE6Mjk6NDEgRVRcbiAgJ1teXFxcXGRdKihbXjpdKyk6KFteOl0rKTooW14gXSspICguKyknXG5cbmNvbnN0IHRvdXJuYW1lbnRJbmZvID0gbmV3IFJlZ0V4cChcbiAgICByb29tR2FtZUlEXG4gICsgdG91cm5hbWVudElEXG4gICsgdG91cm5hbWVudEJ1eUluXG4gICsgcG9rZXJUeXBlXG4gICsgdG91cm5hbWVudExldmVsXG4gICsgZGF0ZVxuICArIHRpbWVcbiAgKyAnJCdcbilcbmNvbnN0IHRvdXJuYW1lbnRJbmZvSWR4cyA9IHtcbiAgICByb29tICAgICAgOiAxXG4gICwgaGFuZGlkICAgIDogMlxuICAsIGdhbWVubyAgICA6IDNcbiAgLCBjdXJyZW5jeSAgOiA0XG4gICwgZG9uYXRpb24gIDogNVxuICAsIHJha2UgICAgICA6IDdcbiAgLCBwb2tlcnR5cGUgOiA4XG4gICwgbGltaXQgICAgIDogOVxuICAsIGxldmVsICAgICA6IDEwXG4gICwgc2IgICAgICAgIDogMTFcbiAgLCBiYiAgICAgICAgOiAxMlxuICAsIHllYXIgICAgICA6IDEzXG4gICwgbW9udGggICAgIDogMTRcbiAgLCBkYXkgICAgICAgOiAxNVxuICAsIGhvdXIgICAgICA6IDE2XG4gICwgbWluICAgICAgIDogMTdcbiAgLCBzZWMgICAgICAgOiAxOFxuICAsIHRpbWV6b25lICA6IDE5XG59XG5cbmNvbnN0IGNhc2hHYW1lSW5mbyA9IG5ldyBSZWdFeHAoXG4gICAgcm9vbUdhbWVJRFxuICArIHBva2VyVHlwZVxuICArIGNhc2hHYW1lQmxpbmRzXG4gICsgJ1sgLV0qJ1xuICArIGRhdGVcbiAgKyB0aW1lXG4gICsgJyQnXG4pXG5cbmNvbnN0IGNhc2hHYW1lSW5mb0lkeHMgPSB7XG4gICAgcm9vbSAgICAgIDogMVxuICAsIGhhbmRpZCAgICA6IDJcbiAgLCBwb2tlcnR5cGUgOiAzXG4gICwgbGltaXQgICAgIDogNFxuICAsIGN1cnJlbmN5ICA6IDVcbiAgLCBzYiAgICAgICAgOiA2XG4gICwgYmIgICAgICAgIDogN1xuICAsIHllYXIgICAgICA6IDhcbiAgLCBtb250aCAgICAgOiA5XG4gICwgZGF5ICAgICAgIDogMTBcbiAgLCBob3VyICAgICAgOiAxMVxuICAsIG1pbiAgICAgICA6IDEyXG4gICwgc2VjICAgICAgIDogMTNcbiAgLCB0aW1lem9uZSAgOiAxNFxufVxuXG5jb25zdCB0b3VybmFtZW50VGFibGUgPVxuICAvXlRhYmxlICdcXGQrIChcXGQrKScgKFxcZCspLW1heCBTZWF0ICMoXFxkKykgaXMuK2J1dHRvbiQvaVxuXG5jb25zdCB0b3VybmFtZW50VGFibGVJZHhzID0ge1xuICAgIHRhYmxlbm8gIDogMVxuICAsIG1heHNlYXRzIDogMlxuICAsIGJ1dHRvbiAgIDogM1xufVxuXG5jb25zdCBjYXNoR2FtZVRhYmxlID1cbiAgL15UYWJsZSAnKFteJ10rKScgKFxcZCspLW1heCBTZWF0ICMoXFxkKykgaXMuK2J1dHRvbiQvaVxuXG5jb25zdCBjYXNoR2FtZVRhYmxlSWR4cyA9IHtcbiAgICB0YWJsZW5vICA6IDFcbiAgLCBtYXhzZWF0cyA6IDJcbiAgLCBidXR0b24gICA6IDNcbn1cblxuY29uc3QgSGFuZEhpc3RvcnlQYXJzZXIgPSByZXF1aXJlKCcuL2Jhc2UnKVxuXG5mdW5jdGlvbiBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKGxpbmVzLCBvcHRzKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKSkgcmV0dXJuIG5ldyBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKGxpbmVzLCBvcHRzKVxuICBIYW5kSGlzdG9yeVBhcnNlci5jYWxsKHRoaXMsIGxpbmVzLCBvcHRzKVxufVxuXG5Ib2xkZW1Qb2tlclN0YXJzUGFyc2VyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoSGFuZEhpc3RvcnlQYXJzZXIucHJvdG90eXBlKVxuSG9sZGVtUG9rZXJTdGFyc1BhcnNlci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyXG5jb25zdCBwcm90byA9IEhvbGRlbVBva2VyU3RhcnNQYXJzZXIucHJvdG90eXBlXG5cbnByb3RvLl9oYW5kSW5mb1J4ID0gZnVuY3Rpb24gX2hhbmRJbmZvUngoZ2FtZVR5cGUpIHtcbiAgc3dpdGNoIChnYW1lVHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAndG91cm5hbWVudCc6IHJldHVybiB7IHJ4OiB0b3VybmFtZW50SW5mbywgaWR4czogdG91cm5hbWVudEluZm9JZHhzIH1cbiAgICBjYXNlICdjYXNoZ2FtZSc6IHJldHVybiB7IHJ4OiBjYXNoR2FtZUluZm8sIGlkeHM6IGNhc2hHYW1lSW5mb0lkeHMgfVxuICAgIGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcignVW5rbm93biBnYW1lIHR5cGUgJyArIGdhbWVUeXBlKVxuICB9XG59XG5cbnByb3RvLl90YWJsZVJ4ID0gZnVuY3Rpb24gX3RhYmxlUngoZ2FtZVR5cGUpIHtcbiAgc3dpdGNoIChnYW1lVHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAndG91cm5hbWVudCc6IHJldHVybiB7IHJ4OiB0b3VybmFtZW50VGFibGUsIGlkeHM6IHRvdXJuYW1lbnRUYWJsZUlkeHMgfVxuICAgIGNhc2UgJ2Nhc2hnYW1lJzogcmV0dXJuIHsgcng6IGNhc2hHYW1lVGFibGUsIGlkeHM6IGNhc2hHYW1lVGFibGVJZHhzIH1cbiAgICBkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZ2FtZSB0eXBlICcgKyBnYW1lVHlwZSlcbiAgfVxufVxuXG5wcm90by5fc2VhdEluZm9SeCAgICAgICAgICA9IC9eU2VhdCAoXFxkKyk6IChbXihdKylcXChbJHzigqxdPyhbXiBdKykgaW4gY2hpcHNcXCkoIC4rc2l0dGluZyBvdXQpPyQvaVxucHJvdG8uX3Bvc3RSeCAgICAgICAgICAgICAgPSAvXihbXjpdKyk6IHBvc3RzICg/OnRoZSApPyhhbnRlfHNtYWxsIGJsaW5kfGJpZyBibGluZCkgWyR84oKsXT8oW14gXSspJC9pXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IC9eXFwqXFwqXFwqIEhPTEUgQ0FSRFMgXFwqXFwqXFwqJC9cbnByb3RvLl9zdHJlZXRJbmRpY2F0b3JSeCAgID0gL15cXCpcXCpcXCogKEZMT1B8VFVSTnxSSVZFUikgXFwqXFwqXFwqW15bXStcXFsoLi4pICguLikgKC4uKSg/OiAoLi4pKT9dKD86IFxcWyguLildKT8kL1xucHJvdG8uX3Nob3dkb3duSW5kaWNhdG9yUnggPSAvXlxcKlxcKlxcKiBTSE9XIERPV04gXFwqXFwqXFwqJC9cbnByb3RvLl9zdW1tYXJ5SW5kaWNhdG9yUnggID0gL15cXCpcXCpcXCogU1VNTUFSWSBcXCpcXCpcXCokL1xucHJvdG8uX2hvbGVjYXJkc1J4ICAgICAgICAgPSAvXkRlYWx0IHRvIChbXltdKykgXFxbKC4uKSAoLi4pXSQvaVxucHJvdG8uX2FjdGlvblJ4ICAgICAgICAgICAgPSAvXihbXjpdKyk6IChyYWlzZXN8YmV0c3xjYWxsc3xjaGVja3N8Zm9sZHMpID9bJHzigqxdPyhbXiBdKyk/KD86IHRvIFskfOKCrF0/KFteIF0rKSk/KC4rYWxsLWluKT8kL2lcbnByb3RvLl9jb2xsZWN0UnggICAgICAgICAgID0gL14oLispIChjb2xsZWN0ZWQpIFskfOKCrF0/KFteIF0rKSBmcm9tLitwb3QkL2lcbnByb3RvLl9zaG93UnggICAgICAgICAgICAgID0gL14oW146XSspOiBzaG93cyBcXFsoLi4pICguLildIFxcKChbXildKylcXCkkL2lcbnByb3RvLl9ib2FyZFJ4ICAgICAgICAgICAgID0gL15Cb2FyZCBcXFsoLi4pPyggLi4pPyggLi4pPyggLi4pPyggLi4pP10kL2lcbnByb3RvLl9tdWNrUnggICAgICAgICAgICAgID0gL15TZWF0IFxcZCs6ICguKykgbXVja2VkIFxcWyguLikgKC4uKV0kL2lcbnByb3RvLl9iZXRSZXR1cm5lZFJ4ICAgICAgID0gL151bmNhbGxlZCBiZXQgWyhdP1skfOKCrF0/KFteICldKylbKV0/IHJldHVybmVkIHRvICguKykkL2lcblxucHJvdG8uX2dhbWVUeXBlID0gZnVuY3Rpb24gX2dhbWVUeXBlKCkge1xuICBpZiAodGhpcy5fY2FjaGVkR2FtZVR5cGUpIHJldHVybiB0aGlzLl9jYWNoZWRHYW1lVHlwZVxuICBjb25zdCBsaW5lcyA9IHRoaXMuX2xpbmVzXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHRvdXJuYW1lbnRJbmZvLnRlc3QobGluZXNbaV0pKSB7XG4gICAgICB0aGlzLl9jYWNoZWRHYW1lVHlwZSA9ICd0b3VybmFtZW50J1xuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZEdhbWVUeXBlXG4gICAgfVxuICAgIGlmIChjYXNoR2FtZUluZm8udGVzdChsaW5lc1tpXSkpIHtcbiAgICAgIHRoaXMuX2NhY2hlZEdhbWVUeXBlID0gJ2Nhc2hnYW1lJ1xuICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZEdhbWVUeXBlXG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsXG59XG5cbmV4cG9ydHMuY2FuUGFyc2UgPSBmdW5jdGlvbiBjYW5QYXJzZShsaW5lcykge1xuICByZXR1cm4gbmV3IEhvbGRlbVBva2VyU3RhcnNQYXJzZXIobGluZXMpLmNhblBhcnNlKClcbn1cblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIHBhcnNlKGxpbmVzLCBpbmZvT25seSkge1xuICByZXR1cm4gbmV3IEhvbGRlbVBva2VyU3RhcnNQYXJzZXIobGluZXMsIGluZm9Pbmx5KS5wYXJzZSgpXG59XG4iLCIndXNlIHN0cmljdCdcblxuZXhwb3J0cy50cmltTGluZSA9IGZ1bmN0aW9uIHRyaW1MaW5lKGxpbmUpIHsgcmV0dXJuIGxpbmUudHJpbSgpIH1cbmV4cG9ydHMuZW1wdHlMaW5lID0gZnVuY3Rpb24gZW1wdHlMaW5lKGxpbmUpIHsgcmV0dXJuIGxpbmUubGVuZ3RoIH1cbmV4cG9ydHMuc2FmZUxvd2VyID0gZnVuY3Rpb24gc2FmZUxvd2VyKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBzLnRvTG93ZXJDYXNlKClcbn1cbmV4cG9ydHMuc2FmZVVwcGVyID0gZnVuY3Rpb24gc2FmZVVwcGVyKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBzLnRvVXBwZXJDYXNlKClcbn1cbmV4cG9ydHMuc2FmZUZpcnN0VXBwZXIgPSBmdW5jdGlvbiBzYWZlRmlyc3RVcHBlcihzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCcgfHwgcy5sZW5ndGggPCAxXG4gICAgPyBzXG4gICAgOiBzWzBdLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpXG59XG5leHBvcnRzLnNhZmVUcmltID0gZnVuY3Rpb24gc2FmZVRyaW0ocykge1xuICByZXR1cm4gdHlwZW9mIHMgPT09ICd1bmRlZmluZWQnXG4gICAgPyB1bmRlZmluZWRcbiAgICA6IHMudHJpbSgpXG59XG5leHBvcnRzLnNhZmVQYXJzZUludCA9IGZ1bmN0aW9uIHNhZmVQYXJzZUludChzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCdcbiAgICA/IHVuZGVmaW5lZFxuICAgIDogcGFyc2VJbnQocylcbn1cbmV4cG9ydHMuc2FmZVBhcnNlRmxvYXQgPSBmdW5jdGlvbiBzYWZlUGFyc2VGbG9hdChzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCdcbiAgICA/IHVuZGVmaW5lZFxuICAgIDogcGFyc2VGbG9hdChzKVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBoaHYgPSByZXF1aXJlKCcuLi9oaHYnKVxuY29uc3QgaGhwID0gcmVxdWlyZSgnaGhwJylcbmNvbnN0IGhoYSA9IHJlcXVpcmUoJ2hoYScpXG5cbmNvbnN0IHZpc3VhbGl6ZWRIYW5kc0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Zpc3VhbGl6ZWQtaGFuZHMnKVxuY29uc3QgaGFuZGhpc3RvcnlFbCAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGFuZGhpc3RvcnktZW50cnknKVxuY29uc3QgZmlsdGVyRWwgICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyJylcbmNvbnN0IGxvYWRTYW1wbGVFbCAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYWQtc2FtcGxlJylcbmNvbnN0IGxvYWRGaWxlRWwgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYWQtZmlsZScpXG5cbmhodi5pbmplY3RTdHlsZShoaHYuY3NzLCBkb2N1bWVudCwgJ2hodi1oYW5kLWNzcycpXG5cbmZ1bmN0aW9uIGFuYWx5emVIaXN0b3J5IChoKSB7XG4gIGNvbnN0IHBhcnNlZCA9IGhocChoKVxuICB0cnkge1xuICAgIHJldHVybiBoaGEocGFyc2VkKVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICAgIGNvbnNvbGUuZXJyb3IoaClcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmNvbnN0IHBsYXllcnMgPSB7fVxuZnVuY3Rpb24gYWRkUGxheWVyIChrKSB7IHBsYXllcnNba10gPSB0cnVlIH1cbmZ1bmN0aW9uIHJlbmRlciAoaCkge1xuICBjb25zdCBpbmZvID0gaGh2LnJlbmRlcihoKVxuICBpbmZvLnBsYXllcnMuZm9yRWFjaChhZGRQbGF5ZXIpXG4gIHJldHVybiBpbmZvLmh0bWxcbn1cblxuZnVuY3Rpb24gaXNudWxsICh4KSB7IHJldHVybiAhIXggfVxuXG5mdW5jdGlvbiBpbml0aWFsaXplRmlsdGVyIChmaWx0ZXJIdG1sLCBoZXJvKSB7XG4gIGZpbHRlckVsLmlubmVySFRNTCA9IGZpbHRlckh0bWxcblxuICBjb25zdCBwbGF5ZXJzRmlsdGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdoaHYtZmlsdGVyLXBsYXllcnMnKVswXVxuICBjb25zdCBzaG93RmlsdGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdoaHYtZmlsdGVyLXNob3cnKVswXVxuICBjb25zdCBkaXNwbGF5RmlsdGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdoaHYtZmlsdGVyLWRpc3BsYXknKVswXVxuXG4gIHBsYXllcnNGaWx0ZXJFbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbnBsYXllcnNDaGFuZ2UpXG4gIHNob3dGaWx0ZXJFbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbnNob3dDaGFuZ2UpXG4gIGRpc3BsYXlGaWx0ZXJFbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBvbmRpc3BsYXlDaGFuZ2UpXG5cbiAgY29uc3Qgb3B0cyA9IHtcbiAgICAgIGhhbmQ6IG51bGxcbiAgICAsIHBsYXllcnM6IHsgZmlsdGVyOiAnaW52ZXN0ZWQnIH1cbiAgfVxuICBsZXQgc2VsZWN0ZWRQbGF5ZXIgPSBoZXJvXG4gIGxldCBwbGF5ZXJTZWxlY3RlZCA9IGZhbHNlXG5cbiAgZnVuY3Rpb24gb25wbGF5ZXJzQ2hhbmdlIChlKSB7XG4gICAgc2VsZWN0ZWRQbGF5ZXIgPSBlLnRhcmdldC52YWx1ZVxuICAgIHVwZGF0ZVNlbGVjdFBsYXllcigpXG4gIH1cblxuICBmdW5jdGlvbiBvbnNob3dDaGFuZ2UgKGUpIHtcbiAgICBjb25zdCBmaWx0ZXIgPSBlLnRhcmdldC52YWx1ZVxuICAgIGlmIChmaWx0ZXIgPT09ICdhbGwnKSB7XG4gICAgICBvcHRzLmhhbmQgPSBudWxsXG4gICAgfSBlbHNlIHtcbiAgICAgIG9wdHMuaGFuZCA9IHsgZmlsdGVyOiBmaWx0ZXIsIHdobzogc2VsZWN0ZWRQbGF5ZXIgfVxuICAgIH1cbiAgICB1cGRhdGVGaWx0ZXIob3B0cylcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uZGlzcGxheUNoYW5nZSAoZSkge1xuICAgIGNvbnN0IHRndCA9IGUudGFyZ2V0XG4gICAgaWYgKHRndC52YWx1ZSA9PT0gJ3NlbGVjdFBsYXllcicpIHtcbiAgICAgIHBsYXllclNlbGVjdGVkID0gdGd0LmNoZWNrZWRcbiAgICAgIHJldHVybiB1cGRhdGVTZWxlY3RQbGF5ZXIodGd0LmNoZWNrZWQpXG4gICAgfVxuICAgIGNvbnN0IHNob3dJbmFjdGl2ZSA9IHRndC5jaGVja2VkXG4gICAgb3B0cy5wbGF5ZXJzID0gc2hvd0luYWN0aXZlID8gbnVsbCA6IHsgZmlsdGVyOiAnaW52ZXN0ZWQnIH1cbiAgICB1cGRhdGVGaWx0ZXIob3B0cylcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNlbGVjdFBsYXllciAoKSB7XG4gICAgaWYgKG9wdHMuaGFuZCkgb3B0cy5oYW5kLndobyA9IHNlbGVjdGVkUGxheWVyXG4gICAgdXBkYXRlRmlsdGVyKClcbiAgICBoaHYuc2VsZWN0UGxheWVyKHBsYXllclNlbGVjdGVkLCBzZWxlY3RlZFBsYXllcilcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUZpbHRlciAoKSB7XG4gICAgaGh2LmZpbHRlckhhbmRzKG9wdHMpXG4gIH1cblxuICB1cGRhdGVGaWx0ZXIoKVxufVxuXG5mdW5jdGlvbiB1cGRhdGUgKCkge1xuICBjb25zdCBoaXN0b3J5VHh0ID0gaGFuZGhpc3RvcnlFbC52YWx1ZS50cmltKClcbiAgY29uc3QgaGlzdG9yaWVzID0gaGhwLmV4dHJhY3RIYW5kcyhoaXN0b3J5VHh0KVxuICBjb25zdCBhbmFseXplZCA9IGhpc3Rvcmllcy5tYXAoYW5hbHl6ZUhpc3RvcnkpLmZpbHRlcihpc251bGwpXG4gIGNvbnN0IHNvcnRlZCA9IGhodi5zb3J0QnlEYXRlVGltZShhbmFseXplZClcbiAgY29uc3QgcmVuZGVyZWQgPSBzb3J0ZWQubWFwKHJlbmRlcikuam9pbignJylcbiAgY29uc3QgYWxsTmFtZXMgPSBPYmplY3Qua2V5cyhwbGF5ZXJzKVxuICBjb25zdCBoZXJvID0gYW5hbHl6ZWRbMF0uaGVyb1xuICBjb25zdCBmaWx0ZXJIdG1sID0gaGh2LnJlbmRlckZpbHRlcihhbGxOYW1lcywgaGVybylcblxuICB2aXN1YWxpemVkSGFuZHNFbC5pbm5lckhUTUwgPSByZW5kZXJlZCArICc8ZGl2PlRvdGFsIG9mICcgKyBzb3J0ZWQubGVuZ3RoICsgJyBoYW5kcy48L2Rpdj4nXG5cbiAgaW5pdGlhbGl6ZUZpbHRlcihmaWx0ZXJIdG1sLCBoZXJvKVxufVxuZnVuY3Rpb24gb25pbnB1dCAoKSB7XG4gIGxvYWRGaWxlRWwudmFsdWUgPSAnJ1xuICB1cGRhdGUoKVxufVxuaGFuZGhpc3RvcnlFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIG9uaW5wdXQpXG5cbmZ1bmN0aW9uIG9ubG9hZFNhbXBsZSAoKSB7XG4gIGhhbmRoaXN0b3J5RWwudmFsdWUgPSByZXF1aXJlKCcuL3NhbXBsZScpXG4gIG9uaW5wdXQoKVxufVxubG9hZFNhbXBsZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25sb2FkU2FtcGxlKVxuXG5mdW5jdGlvbiBvbmxvYWRlZEZpbGUgKGUpIHtcbiAgaWYgKGhhbmRoaXN0b3J5RWwudmFsdWUgPT09IGUudGFyZ2V0LnJlc3VsdCkgcmV0dXJuXG4gIGhhbmRoaXN0b3J5RWwudmFsdWUgPSBlLnRhcmdldC5yZXN1bHRcbiAgdXBkYXRlKClcbn1cblxuZnVuY3Rpb24gb25sb2FkRmlsZSAoZSkge1xuICBjb25zdCBmaWxlID0gdGhpcy5maWxlcy5pdGVtKDApXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xuICAgIGNvbnN0IGZpbGVSZWFkZXIgPSBuZXcgd2luZG93LkZpbGVSZWFkZXIoKVxuICAgIGZpbGVSZWFkZXIucmVhZEFzVGV4dChmaWxlKVxuICAgIGZpbGVSZWFkZXIub25sb2FkID0gb25sb2FkZWRGaWxlXG4gICAgc2V0VGltZW91dChyZWZyZXNoLCAyMDAwKVxuICB9XG4gIHJlZnJlc2goKVxufVxuXG5sb2FkRmlsZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIG9ubG9hZEZpbGUpXG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gW1xuICAgICcqKioqKioqKioqKiAjIDEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDY3MTczOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjM0OjI0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MjY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgyNjg5MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTYzNDMgaW4gY2hpcHMpJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA4MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbS2QgSmhdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk3NyB0byAxNzc3J1xuICAsICdJcmlzaGEyOiBjYWxscyA5NzcnXG4gICwgJyoqKiBGTE9QICoqKiBbN2ggVGggSnNdJ1xuICAsICdoZWxkOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMzIwMCdcbiAgLCAnaGVsZDogcmFpc2VzIDM0NjYgdG8gNjY2NidcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDE1NzcxIHRvIDIyNDM3IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGNhbGxzIDc4NTAgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICg3OTIxKSByZXR1cm5lZCB0byBJcmlzaGEyJ1xuICAsICcqKiogVFVSTiAqKiogWzdoIFRoIEpzXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFs3aCBUaCBKcyA2ZF0gWzljXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ2hlbGQ6IHNob3dzIFtLZCBKaF0gKGEgcGFpciBvZiBKYWNrcyknXG4gICwgJ0lyaXNoYTI6IHNob3dzIFs4cyA5c10gKGEgc3RyYWlnaHQsIFNldmVuIHRvIEphY2spJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAzMjczNiBmcm9tIHBvdCdcbiAgLCAnaGVsZCBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiAzcmQgcGxhY2UgYW5kIHJlY2VpdmVkICQ2Ljc1LidcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzI3MzYgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs3aCBUaCBKcyA2ZCA5Y10nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBzaG93ZWQgWzhzIDlzXSBhbmQgd29uICgzMjczNikgd2l0aCBhIHN0cmFpZ2h0LCBTZXZlbiB0byBKYWNrJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKHNtYWxsIGJsaW5kKSBzaG93ZWQgW0tkIEpoXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBKYWNrcydcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTIwNTk0MjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6MzM6NTQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDM0NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MzE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzMzMwMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoNjQwOSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1FkIFFzXSdcbiAgLCAnRmlzY2hlcnNpdG86IHJhaXNlcyAyNjI1IHRvIDM0MjUgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDMwMjUnXG4gICwgJ2hlbGQ6IHJhaXNlcyAyOTM0IHRvIDYzNTkgYW5kIGlzIGFsbC1pbidcbiAgLCAnRG1lbGxvSDogY2FsbHMgMjkzNCdcbiAgLCAnKioqIEZMT1AgKioqIFs4aCBLZCAyc10nXG4gICwgJyoqKiBUVVJOICoqKiBbOGggS2QgMnNdIFs2c10nXG4gICwgJyoqKiBSSVZFUiAqKiogWzhoIEtkIDJzIDZzXSBbNHNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnRG1lbGxvSDogc2hvd3MgWzdoIDdkXSAoYSBwYWlyIG9mIFNldmVucyknXG4gICwgJ2hlbGQ6IHNob3dzIFtRZCBRc10gKGEgcGFpciBvZiBRdWVlbnMpJ1xuICAsICdoZWxkIGNvbGxlY3RlZCA1ODY4IGZyb20gc2lkZSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBzaG93cyBbMmMgQWRdIChhIHBhaXIgb2YgRGV1Y2VzKSdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTA0NzUgZnJvbSBtYWluIHBvdCdcbiAgLCAnRmlzY2hlcnNpdG8gZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNHRoIHBsYWNlIGFuZCByZWNlaXZlZCAkNS4xMS4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE2MzQzIE1haW4gcG90IDEwNDc1LiBTaWRlIHBvdCA1ODY4LiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzhoIEtkIDJzIDZzIDRzXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgWzJjIEFkXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBEZXVjZXMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbN2ggN2RdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIFNldmVucydcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIHNob3dlZCBbUWQgUXNdIGFuZCB3b24gKDE2MzQzKSB3aXRoIGEgcGFpciBvZiBRdWVlbnMnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDU0Mjc1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMzOjM1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgzNTI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDc2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzQxNTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDUwNTkgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBZCA5c10nXG4gICwgJ2hlbGQ6IHJhaXNlcyAyNTMzIHRvIDMzMzMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDI1MzMpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDIyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MjA1MTA5NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMTozMzoyMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzkgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMzk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjQyMTQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDM0MjAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICg1MTA5IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzhoIDJoXSdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBJcmlzaGEyJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAxMDAwIGZyb20gcG90J1xuICAsICdJcmlzaGEyOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgY29sbGVjdGVkICgxMDAwKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTIwNDM0NjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6MzI6NTQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDQ4MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDI0MjY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzNDI1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoNDE1OSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs5YyA4c10nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDMzMDkgdG8gNDEwOSBhbmQgaXMgYWxsLWluJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzMwOSkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTgwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTgwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDM1NDQwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMyOjIzIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg0ODc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDMxNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzQ3MDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDM2MDkgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLaCA0Y10nXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQwMCkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTAwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTAwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDcgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDE3MTk1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMxOjE0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg0OTI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDc2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTcxMDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIwNzEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIGJpZyBibGluZCA4MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgVGRdJ1xuICAsICdoZWxkOiByYWlzZXMgMTE5OSB0byAxOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyAxMTk5J1xuICAsICcqKiogRkxPUCAqKiogW0tzIDhoIDljXSdcbiAgLCAnRG1lbGxvSDogYmV0cyA0NTk4J1xuICAsICdoZWxkOiByYWlzZXMgMTQwNjMgdG8gMTg2NjEgYW5kIGlzIGFsbC1pbidcbiAgLCAnRG1lbGxvSDogY2FsbHMgMTA0NTQgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgzNjA5KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICcqKiogVFVSTiAqKiogW0tzIDhoIDljXSBbSmNdJ1xuICAsICcqKiogUklWRVIgKioqIFtLcyA4aCA5YyBKY10gWzZjXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtRZCBLaF0gKGEgcGFpciBvZiBLaW5ncyknXG4gICwgJ2hlbGQ6IHNob3dzIFtBZCBUZF0gKGhpZ2ggY2FyZCBBY2UpJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAzNDcwMiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzQ3MDIgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFtLcyA4aCA5YyBKYyA2Y10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBzaG93ZWQgW1FkIEtoXSBhbmQgd29uICgzNDcwMikgd2l0aCBhIHBhaXIgb2YgS2luZ3MnXG4gICwgJ1NlYXQgOTogaGVsZCBzaG93ZWQgW0FkIFRkXSBhbmQgbG9zdCB3aXRoIGhpZ2ggY2FyZCBBY2UnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDA4MzE1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMwOjQxIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg1Mzc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNjQxNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTQ5NTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIwNzYwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tkIDRkXSdcbiAgLCAnRG1lbGxvSDogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbSmQgMmMgQWNdJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ0RtZWxsb0g6IGJldHMgMTkwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTkwMCkgcmV0dXJuZWQgdG8gRG1lbGxvSCdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgMzgwMCBmcm9tIHBvdCdcbiAgLCAnRG1lbGxvSDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0pkIDJjIEFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBvbiB0aGUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGNvbGxlY3RlZCAoMzgwMCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDkgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUyMDAzNDU4OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjMwOjIyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3MDI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyNDI2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTUwMDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDIxMjEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RzIDNzXSdcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbM2QgS2MgS2hdJ1xuICAsICdGaXNjaGVyc2l0bzogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDgwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDgwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMzgwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMzgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzNkIEtjIEtoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBjb2xsZWN0ZWQgKDM4MDApJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDEwICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk5MjU0ODogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyOTo0MSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTU4NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE0MTE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNTQ1MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjIwNjAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs0YyAyZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODAwIHRvIDE2MDAnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDE2MDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFszYyBKYyAzaF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDI0MDAnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDI0MDAnXG4gICwgJyoqKiBUVVJOICoqKiBbM2MgSmMgM2hdIFs2aF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMTYwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGNhbGxzIDE2MDAnXG4gICwgJyoqKiBSSVZFUiAqKiogWzNjIEpjIDNoIDZoXSBbM2RdJ1xuICAsICdGaXNjaGVyc2l0bzogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDMyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyAzMjAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnSXJpc2hhMjogc2hvd3MgW0poIFFzXSAoYSBmdWxsIGhvdXNlLCBUaHJlZXMgZnVsbCBvZiBKYWNrcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBtdWNrcyBoYW5kJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAxOTAwMCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTkwMDAgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFszYyBKYyAzaCA2aCAzZF0nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gbXVja2VkIFtUZCBUY10nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBzaG93ZWQgW0poIFFzXSBhbmQgd29uICgxOTAwMCkgd2l0aCBhIGZ1bGwgaG91c2UsIFRocmVlcyBmdWxsIG9mIEphY2tzJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDExICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk4Njk5NDogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyOToyMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTQ1MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE0NTY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNjMwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjIxMTAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBaCAyY10nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoODAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMjAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGNvbGxlY3RlZCAoMjIwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTIgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTgyNzY1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI5OjA1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxNDk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU0MTQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE2MzUxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgyMDc2MCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKaCBUc10nXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgMTA4OCB0byAxODg4J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDEwODgpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBjb2xsZWN0ZWQgKDIyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAxMyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5NzQzNzk6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYSSAoNDAwLzgwMCkgLSAyMDE2LzAzLzAxIDE6Mjg6MzMgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDE1ODI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxNTQ2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTY0MDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE5ODEwIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgODAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzZjIDNjXSdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiBjYWxscyA0MDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJyoqKiBGTE9QICoqKiBbMmMgN2ggNmRdJ1xuICAsICdoZWxkOiBiZXRzIDk5OSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDk5OSkgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTgwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzJjIDdoIDZkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTgwMCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDE0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk1Njk1NTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyNzoyOCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTU4NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDExMDkyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNjg1MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjM2ODIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA1ZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogY2FsbHMgODAwJ1xuICAsICcqKiogRkxPUCAqKiogW0FjIDRzIDJjXSdcbiAgLCAnaGVsZDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJyoqKiBUVVJOICoqKiBbQWMgNHMgMmNdIFszaF0nXG4gICwgJ2hlbGQ6IGJldHMgMjIyMidcbiAgLCAnSXJpc2hhMjogcmFpc2VzIDI1NzggdG8gNDgwMCdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjU3OCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgODI0NCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgODI0NCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0FjIDRzIDJjIDNoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBjb2xsZWN0ZWQgKDgyNDQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDE1ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk0NTkzNjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFhJICg0MDAvODAwKSAtIDIwMTYvMDMvMDEgMToyNjo0NiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDExNTQyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxODUwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMjM3MzIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFsyYyBKY10nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxNjAwJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogY2FsbHMgODAwJ1xuICAsICcqKiogRkxPUCAqKiogWzhzIDdkIDRjXSdcbiAgLCAnRG1lbGxvSDogY2hlY2tzJ1xuICAsICdGaXNjaGVyc2l0bzogYmV0cyAxNjAwJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxNjAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDM4MDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAzODAwIHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbOHMgN2QgNGNdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGNvbGxlY3RlZCAoMzgwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBvbiB0aGUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTMxMjEzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI1OjUxIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxNDE3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU4ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE4NTUxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxODg5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDQwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtUcyBBZF0nXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgMTA4OCB0byAxODg4J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDEwODgnXG4gICwgJyoqKiBGTE9QICoqKiBbOXMgM2ggMmhdJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ2hlbGQ6IGNoZWNrcydcbiAgLCAnKioqIFRVUk4gKioqIFs5cyAzaCAyaF0gWzhzXSdcbiAgLCAnSXJpc2hhMjogYmV0cyAxNjAwJ1xuICAsICdoZWxkOiBjYWxscyAxNjAwJ1xuICAsICcqKiogUklWRVIgKioqIFs5cyAzaCAyaCA4c10gW0tjXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA4MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAzNjQ0IHRvIDQ0NDQnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDM2NDQpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDkxNzYgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDkxNzYgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs5cyAzaCAyaCA4cyBLY10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFJpdmVyJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJ1dHRvbikgY29sbGVjdGVkICg5MTc2KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTcgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTI4MTgzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWEkgKDQwMC84MDApIC0gMjAxNi8wMy8wMSAxOjI1OjM5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMzYyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTU5MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE4NjAxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxOTM0NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgc21hbGwgYmxpbmQgNDAwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDgwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs1ZCA3c10nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDEwMDAgZnJvbSBwb3QnXG4gICwgJ0Zpc2NoZXJzaXRvOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMTggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxOTIxODQ5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjU6MTUgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDEzNjc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxNTk4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTg5NTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE4ODk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVHMgSmhdJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgzMDApIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDgwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgODAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgY29sbGVjdGVkICg4MDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAxOSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5MTYyNTI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyNDo1NCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzIgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDYyMDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE2MzMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMjI5OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTg5NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbSnMgOGNdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTU1MiB0byA2MTUyIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyA1NTUyJ1xuICAsICcqKiogRkxPUCAqKiogWzNjIEtjIDZzXSdcbiAgLCAnKioqIFRVUk4gKioqIFszYyBLYyA2c10gW0FjXSdcbiAgLCAnKioqIFJJVkVSICoqKiBbM2MgS2MgNnMgQWNdIFtLZF0nXG4gICwgJyoqKiBTSE9XIERPV04gKioqJ1xuICAsICdEbWVsbG9IOiBzaG93cyBbSmggQWhdICh0d28gcGFpciwgQWNlcyBhbmQgS2luZ3MpJ1xuICAsICdUaG9yZSBIOiBzaG93cyBbUWggNmRdICh0d28gcGFpciwgS2luZ3MgYW5kIFNpeGVzKSdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgMTI4NTQgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNXRoIHBsYWNlIGFuZCByZWNlaXZlZCAkMy42OC4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyODU0IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbM2MgS2MgNnMgQWMgS2RdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChidXR0b24pIHNob3dlZCBbUWggNmRdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEtpbmdzIGFuZCBTaXhlcydcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJpZyBibGluZCkgc2hvd2VkIFtKaCBBaF0gYW5kIHdvbiAoMTI4NTQpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIEtpbmdzJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyMCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE5MDkyMzE6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyNDoyNyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTM3NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDY1NTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE2OTgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMjk0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTcyNDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQXMgOGRdJ1xuICAsICdEbWVsbG9IOiBjYWxscyA2MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAxNjIyIHRvIDIyMjInXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxNjIyKSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAyMzUwIGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMzUwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgyMzUwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMjEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODkzNzU1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjM6MjkgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM5IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDEwNTc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3MjAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxODgzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTI5OTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3ODk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA5c10nXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDYwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ2hlbGQ6IGNhbGxzIDYwMCdcbiAgLCAnRmlzY2hlcnNpdG86IGNhbGxzIDMwMCdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICcqKiogRkxPUCAqKiogWzNkIDZjIFRzXSdcbiAgLCAnRmlzY2hlcnNpdG86IGNoZWNrcydcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBjaGVja3MnXG4gICwgJ2hlbGQ6IGNoZWNrcydcbiAgLCAnKioqIFRVUk4gKioqIFszZCA2YyBUc10gW0poXSdcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgMTIwMCdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDEyMDAnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICcqKiogUklWRVIgKioqIFszZCA2YyBUcyBKaF0gW1RoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgMjQwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjQwMCkgcmV0dXJuZWQgdG8gRmlzY2hlcnNpdG8nXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA1MDUwIGZyb20gcG90J1xuICAsICdGaXNjaGVyc2l0bzogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNTA1MCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzNkIDZjIFRzIEpoIFRoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoNTA1MCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgb24gdGhlIFJpdmVyJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJ1dHRvbikgZm9sZGVkIG9uIHRoZSBUdXJuJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyMiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4ODY5MDM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMzowMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzQgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTEyMjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDcyNTIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE4ODgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMzA0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTcwOTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzhzIEtkXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk1NSB0byAxNTU1J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoOTU1KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAxNDUwIGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxNDUwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgxNDUwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMjMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODgyNjQ2OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MjI6NDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDExMjc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg2MTUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxODkzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTMzOTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3NzQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tzIDljXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTUwMiB0byA2MTAyIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNTUwMikgcmV0dXJuZWQgdG8gVGhvcmUgSCdcbiAgLCAnVGhvcmUgSCBjb2xsZWN0ZWQgMTc1MCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTc1MCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBjb2xsZWN0ZWQgKDE3NTApJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgOTogaGVsZCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg3Nzg3MDogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIyOjI5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMTMyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNTA1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTkyODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDE0MDQ5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzc5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs1cyA2aF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyA0NDAyIHRvIDUwMDIgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ0MDIpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDE3NTAgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE3NTAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJ1dHRvbikgY29sbGVjdGVkICgxNzUwKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyNSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4NzM0MDU6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMjoxMiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTEzNzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDU0MDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE5OTMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxNDA5OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY2OTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbSmQgQWRdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDEwNjYgdG8gMTY2NidcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTA2NikgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTc1MCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTc1MCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIGNvbGxlY3RlZCAoMTc1MCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI2ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg2NTQ4NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIxOjQyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4Nzc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3ODUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxOTk4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTQxNDkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2NzQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyA1ZF0nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgNjAwIHRvIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDYwMCdcbiAgLCAnKioqIEZMT1AgKioqIFs5YyBKZCA0ZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDEyMDAnXG4gICwgJyoqKiBUVVJOICoqKiBbOWMgSmQgNGRdIFtBZF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiBiZXRzIDYzMjUgYW5kIGlzIGFsbC1pbidcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNjMyNSkgcmV0dXJuZWQgdG8gRmlzY2hlcnNpdG8nXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA1MDUwIGZyb20gcG90J1xuICAsICdGaXNjaGVyc2l0bzogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNTA1MCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzljIEpkIDRkIEFkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoNTA1MCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIFR1cm4nXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDI3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTg1NzUxMzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjIxOjEyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4ODI1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3OTAyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMDAzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjkyMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY0MjYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3Mzk0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0toIDVoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IHJhaXNlcyA2MDAgdG8gMTIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHJhaXNlcyA1MTc2IHRvIDYzNzYgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDUxNzYnXG4gICwgJyoqKiBGTE9QICoqKiBbM2MgOXMgMmNdJ1xuICAsICcqKiogVFVSTiAqKiogWzNjIDlzIDJjXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFszYyA5cyAyYyA2ZF0gWzNzXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ3NhcGluaG8xMDAxOiBzaG93cyBbQWMgUWNdIChhIHBhaXIgb2YgVGhyZWVzKSdcbiAgLCAnRG1lbGxvSDogc2hvd3MgW0FzIDlkXSAodHdvIHBhaXIsIE5pbmVzIGFuZCBUaHJlZXMpJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAxMzY1MiBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDEgZmluaXNoZWQgdGhlIHRvdXJuYW1lbnQgaW4gNnRoIHBsYWNlIGFuZCByZWNlaXZlZCAkMi40NS4nXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEzNjUyIHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbM2MgOXMgMmMgNmQgM3NdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIHNob3dlZCBbQXMgOWRdIGFuZCB3b24gKDEzNjUyKSB3aXRoIHR3byBwYWlyLCBOaW5lcyBhbmQgVGhyZWVzJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChzbWFsbCBibGluZCkgc2hvd2VkIFtBYyBRY10gYW5kIGxvc3Qgd2l0aCBhIHBhaXIgb2YgVGhyZWVzJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyOCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4NDUyMDA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToyMDoyNSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODg3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNzk1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjAwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwMDM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzExMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc0NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCA2MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUWMgN3NdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IHJhaXNlcyAxMjAwIHRvIDE4MDAnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMTI2MyB0byAzMDYzIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDEyNjMnXG4gICwgJyoqKiBGTE9QICoqKiBbS2ggNmggM2hdJ1xuICAsICcqKiogVFVSTiAqKiogW0toIDZoIDNoXSBbM2NdJ1xuICAsICcqKiogUklWRVIgKioqIFtLaCA2aCAzaCAzY10gWzVkXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtKYyBBc10gKGEgcGFpciBvZiBUaHJlZXMpJ1xuICAsICdzYXBpbmhvMTAwMTogc2hvd3MgWzloIEtkXSAodHdvIHBhaXIsIEtpbmdzIGFuZCBUaHJlZXMpJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgNjQyNiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjQyNiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0toIDZoIDNoIDNjIDVkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbSmMgQXNdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIFRocmVlcydcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBzaG93ZWQgWzloIEtkXSBhbmQgd29uICg2NDI2KSB3aXRoIHR3byBwYWlyLCBLaW5ncyBhbmQgVGhyZWVzJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAyOSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4MzY0NjI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxOTo1MiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzIgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODkyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODAwMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTkyMzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwNjg2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzE2MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc0OTQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtRcyA1aF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IHJhaXNlcyAxMjAwIHRvIDE4MDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzIFs3cyAzY10nXG4gICwgJ1VuY2FsbGVkIGJldCAoMTIwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMTUwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTUwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGNvbGxlY3RlZCAoMTUwMCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzMCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE4MjgzNjA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxOToyMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoODk3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNzE1MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTk4ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDEwNzM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzIxMyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc1NDQgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3YyBUY10nXG4gICwgJ3NhcGluaG8xMDAxIHNhaWQsIFwiOihcIidcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDY1MDIgdG8gNzEwMiBhbmQgaXMgYWxsLWluJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg2NTAyKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCAxNTAwIGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxNTAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgxNTAwKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDMxICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTgxOTUxMTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjE4OjQ2IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg4ODc1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg3MDUyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxOTkzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMTA3ODYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzMjYzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzU5NCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKZCA5ZF0nXG4gICwgJ1Rob3JlIEggc2FpZCwgXCIuLmkuLlwiJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODIyNSB0byA4ODI1IGFuZCBpcyBhbGwtaW4nXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDY0MDIgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgxODIzKSByZXR1cm5lZCB0byBGaXNjaGVyc2l0bydcbiAgLCAnKioqIEZMT1AgKioqIFs1cyAyaCA3Y10nXG4gICwgJyoqKiBUVVJOICoqKiBbNXMgMmggN2NdIFs1aF0nXG4gICwgJyoqKiBSSVZFUiAqKiogWzVzIDJoIDdjIDVoXSBbS2hdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnRmlzY2hlcnNpdG86IHNob3dzIFtLZCBKY10gKHR3byBwYWlyLCBLaW5ncyBhbmQgRml2ZXMpJ1xuICAsICdUaG9yZSBIOiBzaG93cyBbSnMgS2NdICh0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzKSdcbiAgLCAnRmlzY2hlcnNpdG8gY29sbGVjdGVkIDcxNTIgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDcxNTIgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE0MzA0IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNXMgMmggN2MgNWggS2hdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgc2hvd2VkIFtLZCBKY10gYW5kIHdvbiAoNzE1Mikgd2l0aCB0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJpZyBibGluZCkgc2hvd2VkIFtKcyBLY10gYW5kIHdvbiAoNzE1Mikgd2l0aCB0d28gcGFpciwgS2luZ3MgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzIgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODEyNzk0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTg6MjAgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM3IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk1MjUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDI5NzYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDE5OTgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMDgzNiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDYyMzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE3OTQ0IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAzMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzZjIDVzXSdcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDIzMjYgdG8gMjkyNiBhbmQgaXMgYWxsLWluJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMzI2MyB0byA2MTg5IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzI2MykgcmV0dXJuZWQgdG8gc2FwaW5obzEwMDEnXG4gICwgJyoqKiBGTE9QICoqKiBbOGggM2ggS2NdJ1xuICAsICcqKiogVFVSTiAqKiogWzhoIDNoIEtjXSBbOWRdJ1xuICAsICcqKiogUklWRVIgKioqIFs4aCAzaCBLYyA5ZF0gWzVoXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ1Rob3JlIEg6IHNob3dzIFs5aCBUaF0gKGEgZmx1c2gsIFRlbiBoaWdoKSdcbiAgLCAnc2FwaW5obzEwMDE6IHNob3dzIFtKcyBRZF0gKGhpZ2ggY2FyZCBLaW5nKSdcbiAgLCAnVGhvcmUgSCBjb2xsZWN0ZWQgNzA1MiBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNzA1MiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzhoIDNoIEtjIDlkIDVoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgWzloIFRoXSBhbmQgd29uICg3MDUyKSB3aXRoIGEgZmx1c2gsIFRlbiBoaWdoJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIHNob3dlZCBbSnMgUWRdIGFuZCBsb3N0IHdpdGggaGlnaCBjYXJkIEtpbmcnXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxODA2ODM4OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTc6NTggRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM0IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk1NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEyMzggaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIwMDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgxMDg4NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY1ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE5MTgyIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzljIDZoXSdcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNTg4IHRvIDExODggYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IGNhbGxzIDU4OCdcbiAgLCAnKioqIEZMT1AgKioqIFs1cyA2cyA3Y10nXG4gICwgJyoqKiBUVVJOICoqKiBbNXMgNnMgN2NdIFtBc10nXG4gICwgJyoqKiBSSVZFUiAqKiogWzVzIDZzIDdjIEFzXSBbNWRdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnaGVsZDogc2hvd3MgWzljIDZoXSAodHdvIHBhaXIsIFNpeGVzIGFuZCBGaXZlcyknXG4gICwgJ1Rob3JlIEg6IHNob3dzIFtBaCAzZF0gKHR3byBwYWlyLCBBY2VzIGFuZCBGaXZlcyknXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDI5NzYgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEggc2FpZCwgXCJuaCAgdyBhbmtlclwiJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyOTc2IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNXMgNnMgN2MgQXMgNWRdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIHNob3dlZCBbQWggM2RdIGFuZCB3b24gKDI5NzYpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIEZpdmVzJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDk6IGhlbGQgKGJpZyBibGluZCkgc2hvd2VkIFs5YyA2aF0gYW5kIGxvc3Qgd2l0aCB0d28gcGFpciwgU2l4ZXMgYW5kIEZpdmVzJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzNCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3OTU5OTY6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxNzoxNiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzMgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoOTYyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoNjI4MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjAwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUwNDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg3MjM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxOTIzMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3cyA4ZF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyA1NjMxIHRvIDYyMzEgYW5kIGlzIGFsbC1pbidcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDQ2OTMgYW5kIGlzIGFsbC1pbidcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDEyMzgpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJyoqKiBGTE9QICoqKiBbNWQgM3MgUWRdJ1xuICAsICcqKiogVFVSTiAqKiogWzVkIDNzIFFkXSBbNmRdJ1xuICAsICcqKiogUklWRVIgKioqIFs1ZCAzcyBRZCA2ZF0gW1FoXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0RtZWxsb0g6IHNob3dzIFtLZCBRc10gKHRocmVlIG9mIGEga2luZCwgUXVlZW5zKSdcbiAgLCAnVGhvcmUgSDogc2hvd3MgWzJoIEFkXSAoYSBwYWlyIG9mIFF1ZWVucyknXG4gICwgJ0RtZWxsb0ggY29sbGVjdGVkIDEwODg2IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDg4NiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzVkIDNzIFFkIDZkIFFoXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgWzJoIEFkXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBRdWVlbnMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbS2QgUXNdIGFuZCB3b24gKDEwODg2KSB3aXRoIHRocmVlIG9mIGEga2luZCwgUXVlZW5zJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzUgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzg1NzU5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgWCAoMzAwLzYwMCkgLSAyMDE2LzAzLzAxIDE6MTY6MzYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDk2NzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDc4ODYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIwNDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1NjkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNzI4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY1MjcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyBKZF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogcmFpc2VzIDk1NSB0byAxNTU1J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDE1NTUnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFtRcyAzZCA2Y10nXG4gICwgJ2hlbGQ6IGJldHMgMzMzMydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzMzMykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNDMxMCBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNDMxMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW1FzIDNkIDZjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDQzMTApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyAzNiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3ODIwNjM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBYICgzMDAvNjAwKSAtIDIwMTYvMDMvMDEgMToxNjoyMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzEgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoOTcyNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODIzNiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjEwODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDQ1NDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg3MzM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjU3NyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMzAwJ1xuICAsICdJcmlzaGEyOiBwb3N0cyBiaWcgYmxpbmQgNjAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzVoIFFjXSdcbiAgLCAnRG1lbGxvSDogcmFpc2VzIDM4OTMgdG8gNDQ5MyBhbmQgaXMgYWxsLWluJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgzODkzKSByZXR1cm5lZCB0byBEbWVsbG9IJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCAxODAwIGZyb20gcG90J1xuICAsICdEbWVsbG9IOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxODAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggY29sbGVjdGVkICgxODAwKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDM3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTc3MDY3NzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFggKDMwMC82MDApIC0gMjAxNi8wMy8wMSAxOjE1OjM5IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICgxMDA3NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoODg4NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMjExMzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUxOTMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1NTg5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjYyNyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgNTAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDUwJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSA1MCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHNtYWxsIGJsaW5kIDMwMCdcbiAgLCAnVGhvcmUgSDogcG9zdHMgYmlnIGJsaW5kIDYwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtLcyA1aF0nXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBjYWxscyA2MDAnXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgNDkzOSB0byA1NTM5IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg0OTM5KSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDI0MDAgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyNDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGNvbGxlY3RlZCAoMjQwMCknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDM4ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTc2MjkwNjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxNTowOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoMTA1MDAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg5MTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxMTU1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MjE4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNDg2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY4NTIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbNHMgSmNdJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDQ0MzkgdG8gNDgzOSBhbmQgaXMgYWxsLWluJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ0MzkpIHJldHVybmVkIHRvIHNhcGluaG8xMDAxJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgMTE1MCBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDE6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDExNTAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIGNvbGxlY3RlZCAoMTE1MCknXG4gICwgJ1NlYXQgOTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgMzkgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzQ5MTQ1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjE0OjE3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNCBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2NzcwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg4OTM2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMTE4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTI0MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDMyMDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1Mjg5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjg3NyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs3aCBRaF0nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogcmFpc2VzIDgwMCB0byAxMjAwJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogcmFpc2VzIDE5ODAgdG8gMzE4MCBhbmQgaXMgYWxsLWluJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjYWxscyAxOTgwJ1xuICAsICcqKiogRkxPUCAqKiogW0poIFRzIDVkXSdcbiAgLCAnKioqIFRVUk4gKioqIFtKaCBUcyA1ZF0gW1RoXSdcbiAgLCAnKioqIFJJVkVSICoqKiBbSmggVHMgNWQgVGhdIFtRZF0nXG4gICwgJyoqKiBTSE9XIERPV04gKioqJ1xuICAsICdaYW51c3NvZjogc2hvd3MgW0FjIEpzXSAodHdvIHBhaXIsIEphY2tzIGFuZCBUZW5zKSdcbiAgLCAnRmlzY2hlcnNpdG86IHNob3dzIFtUYyA5Y10gKHRocmVlIG9mIGEga2luZCwgVGVucyknXG4gICwgJ0Zpc2NoZXJzaXRvIGNvbGxlY3RlZCA2OTM1IGZyb20gcG90J1xuICAsICdaYW51c3NvZiBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiA3dGggcGxhY2UgYW5kIHJlY2VpdmVkICQxLjQzLidcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjkzNSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0poIFRzIDVkIFRoIFFkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgW1RjIDljXSBhbmQgd29uICg2OTM1KSB3aXRoIHRocmVlIG9mIGEga2luZCwgVGVucydcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoc21hbGwgYmxpbmQpIHNob3dlZCBbQWMgSnNdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEphY2tzIGFuZCBUZW5zJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNDAgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNzQzMjE0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjEzOjU0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2Nzk1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICg4MTg2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgyMTIwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTQ2OCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDM2MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICg1MzE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNjkwMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1phbnVzc29mOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RoIEtkXSdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiByYWlzZXMgNDAwIHRvIDgwMCdcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDAwKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCAxMTc1IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMTc1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGNvbGxlY3RlZCAoMTE3NSknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MzgwMjQ6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTM6MzUgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDgyMTEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxNDMwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTE4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzY1NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDUzMzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTI3IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnRG1lbGxvSDogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFszcyA5ZF0nXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMjAwKSByZXR1cm5lZCB0byBEbWVsbG9IJ1xuICAsICdEbWVsbG9IIGNvbGxlY3RlZCA1NzUgZnJvbSBwb3QnXG4gICwgJ0RtZWxsb0g6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDU3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoNTc1KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MjgwMDg6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTI6NTYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMxIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4NDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg0MzYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxODU1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTQzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzY4MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDQ1ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTUyIGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnSXJpc2hhMjogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtBaCA4Y10nXG4gICwgJ0lyaXNoYTIgc2FpZCwgXCImJiYmXCInXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ1Rob3JlIEggc2FpZCwgXCJob3BlIHUgZGllIGZhc3RcIidcbiAgLCAnSXJpc2hhMiBzYWlkLCBcIj8/Pz8/Pz8/Pz8/P1wiJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDgwMCB0byAxMjAwJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoODAwKSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDExNzUgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMTc1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgKDExNzUpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0MyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE3MjIyNjc6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTI6MzQgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM5IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDcwNzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDg4NjEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDIxODgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTY4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzcwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM4MzkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDE2OTc3IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgOWhdJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnVGhvcmUgSCBzYWlkLCBcInJ1c3NpYW4gIGIgYXN0YXJkXCInXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgMzQxNCB0byAzODE0IGFuZCBpcyBhbGwtaW4nXG4gICwgJ2hlbGQ6IGZvbGRzJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDM0MTQpIHJldHVybmVkIHRvIHNhcGluaG8xMDAxJ1xuICAsICdzYXBpbmhvMTAwMSBjb2xsZWN0ZWQgMTE3NSBmcm9tIHBvdCdcbiAgLCAnc2FwaW5obzEwMDE6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDExNzUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIGNvbGxlY3RlZCAoMTE3NSknXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDQ0ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTcwNzI3ODogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxMTozNiBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoNzQ5NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTkwODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDEwMjI0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MTkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoMzczMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICg3MDcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzODY0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzIwMiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0tkIDloXSdcbiAgLCAnVGhvcmUgSDogcmFpc2VzIDQwMCB0byA4MDAnXG4gICwgJ0lyaXNoYTI6IHJhaXNlcyA4MDAgdG8gMTYwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBjYWxscyA2ODIgYW5kIGlzIGFsbC1pbidcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBjYWxscyA4MDAnXG4gICwgJyoqKiBGTE9QICoqKiBbQXMgUXMgNWhdJ1xuICAsICdUaG9yZSBIOiBjaGVja3MnXG4gICwgJ0lyaXNoYTI6IGJldHMgMTYwMCdcbiAgLCAnVGhvcmUgSDogY2FsbHMgMTYwMCdcbiAgLCAnKioqIFRVUk4gKioqIFtBcyBRcyA1aF0gWzhjXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDI4MDAnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDI4MDAnXG4gICwgJyoqKiBSSVZFUiAqKiogW0FzIFFzIDVoIDhjXSBbUWNdJ1xuICAsICdUaG9yZSBIOiBiZXRzIDEzMDYwIGFuZCBpcyBhbGwtaW4nXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDQxOTkgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICg4ODYxKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnVGhvcmUgSDogc2hvd3MgW0FjIFRoXSAodHdvIHBhaXIsIEFjZXMgYW5kIFF1ZWVucyknXG4gICwgJ0lyaXNoYTI6IHNob3dzIFtBaCBRaF0gKGEgZnVsbCBob3VzZSwgUXVlZW5zIGZ1bGwgb2YgQWNlcyknXG4gICwgJ0lyaXNoYTIgY29sbGVjdGVkIDE5MDM0IGZyb20gc2lkZSBwb3QnXG4gICwgJ21vcmVuYTIxMTogc2hvd3MgWzZoIDZjXSAodHdvIHBhaXIsIFF1ZWVucyBhbmQgU2l4ZXMpJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCAyODQ2IGZyb20gbWFpbiBwb3QnXG4gICwgJ21vcmVuYTIxMSBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiA4dGggcGxhY2UnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIxODgwIE1haW4gcG90IDI4NDYuIFNpZGUgcG90IDE5MDM0LiB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0FzIFFzIDVoIDhjIFFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBzaG93ZWQgW0FjIFRoXSBhbmQgbG9zdCB3aXRoIHR3byBwYWlyLCBBY2VzIGFuZCBRdWVlbnMnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBzaG93ZWQgW0FoIFFoXSBhbmQgd29uICgyMTg4MCkgd2l0aCBhIGZ1bGwgaG91c2UsIFF1ZWVucyBmdWxsIG9mIEFjZXMnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBzaG93ZWQgWzZoIDZjXSBhbmQgbG9zdCB3aXRoIHR3byBwYWlyLCBRdWVlbnMgYW5kIFNpeGVzJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0NSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2OTk2MTk6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MTE6MDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY3MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MTEwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxMDI0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNTIxOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDM3NTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNzMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNDA4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTc2MjcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnaGVsZDogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs5ZCBBaF0nXG4gICwgJ0Zpc2NoZXJzaXRvOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg4MDApIHJldHVybmVkIHRvIEZpc2NoZXJzaXRvJ1xuICAsICdGaXNjaGVyc2l0byBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnRmlzY2hlcnNpdG86IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gY29sbGVjdGVkICgxMjAwKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNDYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjkxMjY1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjEwOjM1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2NzQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTEzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAyNzQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDUyNDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICgzNzgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDExNTcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNTE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNzY1MiBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUXMgNmRdJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IGZvbGRzJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgMjAwJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDEwMDAgdG8gMTQwMCdcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMDAwKSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnc2FwaW5obzEwMDEgY29sbGVjdGVkIDEwMDAgZnJvbSBwb3QnXG4gICwgJ3NhcGluaG8xMDAxOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAxMDAwIHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTAwMCknXG4gICwgJ1NlYXQgOTogaGVsZCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDQ3ICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTY4MzQ0NzogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIElYICgyMDAvNDAwKSAtIDIwMTYvMDMvMDEgMToxMDowNSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAzXFwnIDktbWF4IFNlYXQgIzQgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoNjc3MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTkxNjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKDEwMjk5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1MjY4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDAwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNTgyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzUzOSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY4NzcgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0FzIDhzXSdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdoZWxkOiByYWlzZXMgNzU3IHRvIDExNTcnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDc1NykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnaGVsZDogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTIwMCB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgOTogaGVsZCBjb2xsZWN0ZWQgKDEyMDApJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0OCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2NzY5NzM6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDk6NDEgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMzIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY3OTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MTg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg5NTI0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg1NDkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDQzMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNjA3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzU2NCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTY5MDIgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdaYW51c3NvZjogcG9zdHMgYmlnIGJsaW5kIDQwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtKYyA5c10nXG4gICwgJ21vcmVuYTIxMTogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGNhbGxzIDQwMCdcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBjaGVja3MnXG4gICwgJyoqKiBGTE9QICoqKiBbSmggNWMgQWNdJ1xuICAsICdaYW51c3NvZjogY2hlY2tzJ1xuICAsICdJcmlzaGEyOiBiZXRzIDQwMCdcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQwMCkgcmV0dXJuZWQgdG8gSXJpc2hhMidcbiAgLCAnSXJpc2hhMiBjb2xsZWN0ZWQgMTIwMCBmcm9tIHBvdCdcbiAgLCAnSXJpc2hhMjogZG9lc25cXCd0IHNob3cgaGFuZCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgMTIwMCB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0poIDVjIEFjXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYnV0dG9uKSBjb2xsZWN0ZWQgKDEyMDApJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKGJpZyBibGluZCkgZm9sZGVkIG9uIHRoZSBGbG9wJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA0OSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2NjE2MTY6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDg6NDMgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICMyIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDY4MjAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5MjEwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg5NzQ5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICg2NTE3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDQ1NSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICgxNjMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoMzU4OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTU1MjggaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgc21hbGwgYmxpbmQgMjAwJ1xuICAsICdEbWVsbG9IOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW1RzIEFjXSdcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA1OTkgdG8gOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogY2FsbHMgNTk5J1xuICAsICcqKiogRkxPUCAqKiogWzRjIEpkIEpjXSdcbiAgLCAnRG1lbGxvSDogY2hlY2tzJ1xuICAsICdoZWxkOiBiZXRzIDExMTEnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDExMTEpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDIzOTggZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDIzOTggfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFs0YyBKZCBKY10nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoYmlnIGJsaW5kKSBmb2xkZWQgb24gdGhlIEZsb3AnXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgyMzk4KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTAgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjU1MTgwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA4OjE4IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg2ODQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTQzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAxNzQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDY1NDIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICg0NDgwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDE2NTcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNjE0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxNDc1MyBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbS2QgUWRdJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA1OTkgdG8gOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg1OTkpIHJldHVybmVkIHRvIGhlbGQnXG4gICwgJ2hlbGQgY29sbGVjdGVkIDEyMDAgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDEyMDAgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDk6IGhlbGQgY29sbGVjdGVkICgxMjAwKSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTEgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjM4MzkzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA3OjE1IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjOSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3MDcwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTg2MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoMTAxOTkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggKDY1NjcgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mICg0NTA1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKDE2ODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNhcGluaG8xMDAxICgzNjM5IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA4OiBjZWxpYW9idXRsZWUgKDI4OTMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDk6IGhlbGQgKDExMDg1IGluIGNoaXBzKSdcbiAgLCAnRmlzY2hlcnNpdG86IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnSXJpc2hhMjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0RtZWxsb0g6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdaYW51c3NvZjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ21vcmVuYTIxMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVGQgVGNdJ1xuICAsICdJcmlzaGEyOiBmb2xkcydcbiAgLCAnRG1lbGxvSDogZm9sZHMnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IHJhaXNlcyA0MDAgdG8gODAwJ1xuICAsICdoZWxkOiByYWlzZXMgMTE5OSB0byAxOTk5J1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IGNhbGxzIDExOTknXG4gICwgJyoqKiBGTE9QICoqKiBbNGggS2MgQWhdJ1xuICAsICdjZWxpYW9idXRsZWU6IGNoZWNrcydcbiAgLCAnaGVsZDogYmV0cyA4NjknXG4gICwgJ2NlbGlhb2J1dGxlZTogY2FsbHMgODY5IGFuZCBpcyBhbGwtaW4nXG4gICwgJyoqKiBUVVJOICoqKiBbNGggS2MgQWhdIFtBZF0nXG4gICwgJyoqKiBSSVZFUiAqKiogWzRoIEtjIEFoIEFkXSBbNnNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnY2VsaWFvYnV0bGVlOiBzaG93cyBbSmMgUXNdIChhIHBhaXIgb2YgQWNlcyknXG4gICwgJ2hlbGQ6IHNob3dzIFtUZCBUY10gKHR3byBwYWlyLCBBY2VzIGFuZCBUZW5zKSdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNjU2MSBmcm9tIHBvdCdcbiAgLCAnY2VsaWFvYnV0bGVlIGZpbmlzaGVkIHRoZSB0b3VybmFtZW50IGluIDl0aCBwbGFjZSdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjU2MSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgWzRoIEtjIEFoIEFkIDZzXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIHNob3dlZCBbSmMgUXNdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIEFjZXMnXG4gICwgJ1NlYXQgOTogaGVsZCAoYnV0dG9uKSBzaG93ZWQgW1RkIFRjXSBhbmQgd29uICg2NTYxKSB3aXRoIHR3byBwYWlyLCBBY2VzIGFuZCBUZW5zJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE2MzEwNjQ6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBJWCAoMjAwLzQwMCkgLSAyMDE2LzAzLzAxIDE6MDY6NDcgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM4IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDc0OTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5ODg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICgxMDIyNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjU5MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1MzAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoMTcwNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM2NjQgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoMzcxOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoOTY4NSBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0poIEFzXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiBmb2xkcydcbiAgLCAnWmFudXNzb2Y6IGZvbGRzJ1xuICAsICdtb3JlbmEyMTE6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ2NlbGlhb2J1dGxlZTogcmFpc2VzIDQwMCB0byA4MDAnXG4gICwgJ2hlbGQ6IHJhaXNlcyAxMTk5IHRvIDE5OTknXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnY2VsaWFvYnV0bGVlOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMTk5KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCAyMjI1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAyMjI1IHwgUmFrZSAwJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChzbWFsbCBibGluZCkgY29sbGVjdGVkICgyMjI1KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjIyNDQ1OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA2OjE0IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNyBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3NTIwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTkxMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoNjYyNCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoNjYxNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1NTUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNDUzMiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDM2ODkgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoMzk0MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTAxMTAgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdjZWxpYW9idXRsZWU6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyBzbWFsbCBibGluZCAyMDAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCA0MDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbN2QgNWhdJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IGZvbGRzJ1xuICAsICdJcmlzaGEyOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgMTIwMCdcbiAgLCAnc2FwaW5obzEwMDE6IGZvbGRzJ1xuICAsICdjZWxpYW9idXRsZWU6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnKioqIEZMT1AgKioqIFsyaCAyYyAzY10nXG4gICwgJ0lyaXNoYTI6IGJldHMgNDAwJ1xuICAsICdtb3JlbmEyMTE6IGNhbGxzIDQwMCdcbiAgLCAnKioqIFRVUk4gKioqIFsyaCAyYyAzY10gWzRkXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA0MDAnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgNDAwJ1xuICAsICcqKiogUklWRVIgKioqIFsyaCAyYyAzYyA0ZF0gWzNzXSdcbiAgLCAnSXJpc2hhMjogYmV0cyA4MDAnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgODAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnSXJpc2hhMjogc2hvd3MgW0FkIFFzXSAodHdvIHBhaXIsIFRocmVlcyBhbmQgRGV1Y2VzKSdcbiAgLCAnbW9yZW5hMjExOiBtdWNrcyBoYW5kJ1xuICAsICdJcmlzaGEyIGNvbGxlY3RlZCA2NDI1IGZyb20gcG90J1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA2NDI1IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbMmggMmMgM2MgNGQgM3NdJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyIHNob3dlZCBbQWQgUXNdIGFuZCB3b24gKDY0MjUpIHdpdGggdHdvIHBhaXIsIFRocmVlcyBhbmQgRGV1Y2VzJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgbXVja2VkIFtUaCBLZF0nXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKGJ1dHRvbikgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTQgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNjExMTczOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgSVggKDIwMC80MDApIC0gMjAxNi8wMy8wMSAxOjA1OjMyIEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDNcXCcgOS1tYXggU2VhdCAjNiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IEZpc2NoZXJzaXRvICg3NTQ1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxOTkzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiAoNjY0OSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCAoMzAyMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogWmFudXNzb2YgKDQ1ODAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IG1vcmVuYTIxMSAoNDU1NyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2FwaW5obzEwMDEgKDY3MTAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDg6IGNlbGlhb2J1dGxlZSAoNDM2OCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgOTogaGVsZCAoMTAxMzUgaW4gY2hpcHMpJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdJcmlzaGEyOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnRG1lbGxvSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1phbnVzc29mOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnbW9yZW5hMjExOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdjZWxpYW9idXRsZWU6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHNtYWxsIGJsaW5kIDIwMCdcbiAgLCAnY2VsaWFvYnV0bGVlOiBwb3N0cyBiaWcgYmxpbmQgNDAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzJjIDdjXSdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ0Zpc2NoZXJzaXRvOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0lyaXNoYTI6IGZvbGRzJ1xuICAsICdEbWVsbG9IOiByYWlzZXMgODAwIHRvIDEyMDAnXG4gICwgJ1phbnVzc29mOiBmb2xkcydcbiAgLCAnbW9yZW5hMjExOiBmb2xkcydcbiAgLCAnc2FwaW5obzEwMDE6IHJhaXNlcyAzMDI1IHRvIDQyMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGNhbGxzIDE3OTYgYW5kIGlzIGFsbC1pbidcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMjI5KSByZXR1cm5lZCB0byBzYXBpbmhvMTAwMSdcbiAgLCAnKioqIEZMT1AgKioqIFtRaCA2YyBKaF0nXG4gICwgJyoqKiBUVVJOICoqKiBbUWggNmMgSmhdIFtUaF0nXG4gICwgJyoqKiBSSVZFUiAqKiogW1FoIDZjIEpoIFRoXSBbOWNdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnc2FwaW5obzEwMDE6IHNob3dzIFs4aCA4c10gKGEgc3RyYWlnaHQsIEVpZ2h0IHRvIFF1ZWVuKSdcbiAgLCAnRG1lbGxvSDogc2hvd3MgW0toIEtjXSAoYSBzdHJhaWdodCwgTmluZSB0byBLaW5nKSdcbiAgLCAnRG1lbGxvSCBjb2xsZWN0ZWQgNjYxNyBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNjYxNyB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW1FoIDZjIEpoIFRoIDljXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMzogSXJpc2hhMiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNDogRG1lbGxvSCBzaG93ZWQgW0toIEtjXSBhbmQgd29uICg2NjE3KSB3aXRoIGEgc3RyYWlnaHQsIE5pbmUgdG8gS2luZydcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoc21hbGwgYmxpbmQpIHNob3dlZCBbOGggOHNdIGFuZCBsb3N0IHdpdGggYSBzdHJhaWdodCwgRWlnaHQgdG8gUXVlZW4nXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIChiaWcgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTUgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTkzOTQ0OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDQ6MjYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgM1xcJyA5LW1heCBTZWF0ICM1IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogRmlzY2hlcnNpdG8gKDUyNDUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE5OTYwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBJcmlzaGEyICg2Njc0IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA0OiBEbWVsbG9IICgzMDQ2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBaYW51c3NvZiAoNDYwNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogbW9yZW5hMjExICg2MzgyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoNzAzNSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlICg0MzkzIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA5OiBoZWxkICgxMDE2MCBpbiBjaGlwcyknXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0lyaXNoYTI6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdEbWVsbG9IOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnWmFudXNzb2Y6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2NlbGlhb2J1dGxlZTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdtb3JlbmEyMTE6IHBvc3RzIHNtYWxsIGJsaW5kIDE1MCdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbVGQgUWRdJ1xuICAsICdjZWxpYW9idXRsZWU6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnRmlzY2hlcnNpdG86IHJhaXNlcyAzMDAgdG8gNjAwJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnSXJpc2hhMjogZm9sZHMnXG4gICwgJ0RtZWxsb0g6IGZvbGRzJ1xuICAsICdaYW51c3NvZjogZm9sZHMnXG4gICwgJ21vcmVuYTIxMTogY2FsbHMgNDUwJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJyoqKiBGTE9QICoqKiBbS2MgQWggNmhdJ1xuICAsICdtb3JlbmEyMTE6IGNoZWNrcydcbiAgLCAnRmlzY2hlcnNpdG86IGJldHMgOTAwJ1xuICAsICdtb3JlbmEyMTE6IGNhbGxzIDkwMCdcbiAgLCAnKioqIFRVUk4gKioqIFtLYyBBaCA2aF0gWzVkXSdcbiAgLCAnbW9yZW5hMjExOiBjaGVja3MnXG4gICwgJ0Zpc2NoZXJzaXRvOiBjaGVja3MnXG4gICwgJyoqKiBSSVZFUiAqKiogW0tjIEFoIDZoIDVkXSBbOGRdJ1xuICAsICdtb3JlbmEyMTE6IGJldHMgMzAwJ1xuICAsICdGaXNjaGVyc2l0bzogY2FsbHMgMzAwJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnbW9yZW5hMjExOiBzaG93cyBbVGggS3NdIChhIHBhaXIgb2YgS2luZ3MpJ1xuICAsICdGaXNjaGVyc2l0bzogc2hvd3MgW0FzIDdzXSAoYSBwYWlyIG9mIEFjZXMpJ1xuICAsICdGaXNjaGVyc2l0byBjb2xsZWN0ZWQgNDEyNSBmcm9tIHBvdCdcbiAgLCAnKioqIFNVTU1BUlkgKioqJ1xuICAsICdUb3RhbCBwb3QgNDEyNSB8IFJha2UgMCdcbiAgLCAnQm9hcmQgW0tjIEFoIDZoIDVkIDhkXSdcbiAgLCAnU2VhdCAxOiBGaXNjaGVyc2l0byBzaG93ZWQgW0FzIDdzXSBhbmQgd29uICg0MTI1KSB3aXRoIGEgcGFpciBvZiBBY2VzJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDM6IElyaXNoYTIgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDQ6IERtZWxsb0ggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IFphbnVzc29mIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA2OiBtb3JlbmEyMTEgKHNtYWxsIGJsaW5kKSBzaG93ZWQgW1RoIEtzXSBhbmQgbG9zdCB3aXRoIGEgcGFpciBvZiBLaW5ncydcbiAgLCAnU2VhdCA3OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgODogY2VsaWFvYnV0bGVlIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA5OiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTYgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTczNDAwOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDM6MDggRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICMxIGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoMTAxODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDE0NzE2IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAzOiBGaXNjaGVyc2l0byAoNTU3MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDgyMzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDM2OTQgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0Zpc2NoZXJzaXRvOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdGaXNjaGVyc2l0bzogcG9zdHMgYmlnIGJsaW5kIDMwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFtRYyAyaF0nXG4gICwgJ3NhcGluaG8xMDAxOiByYWlzZXMgODc1IHRvIDExNzUnXG4gICwgJ3NoaWJhYmE0MjA6IHJhaXNlcyAyNDk0IHRvIDM2NjkgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyAxMTAyMiB0byAxNDY5MSBhbmQgaXMgYWxsLWluJ1xuICAsICdGaXNjaGVyc2l0bzogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICgxMTAyMikgcmV0dXJuZWQgdG8gVGhvcmUgSCdcbiAgLCAnKioqIEZMT1AgKioqIFtBZCBUZCA5aF0nXG4gICwgJyoqKiBUVVJOICoqKiBbQWQgVGQgOWhdIFs0ZF0nXG4gICwgJyoqKiBSSVZFUiAqKiogW0FkIFRkIDloIDRkXSBbOWRdJ1xuICAsICcqKiogU0hPVyBET1dOICoqKidcbiAgLCAnVGhvcmUgSDogc2hvd3MgW0toIEtkXSAoYSBmbHVzaCwgQWNlIGhpZ2gpJ1xuICAsICdzaGliYWJhNDIwOiBzaG93cyBbUWggQWNdICh0d28gcGFpciwgQWNlcyBhbmQgTmluZXMpJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCA4OTM4IGZyb20gcG90J1xuICAsICdzaGliYWJhNDIwIGZpbmlzaGVkIHRoZSB0b3VybmFtZW50IGluIDEwdGggcGxhY2UnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg5MzggfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFtBZCBUZCA5aCA0ZCA5ZF0nXG4gICwgJ1NlYXQgMTogaGVsZCAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIHNob3dlZCBbS2ggS2RdIGFuZCB3b24gKDg5MzgpIHdpdGggYSBmbHVzaCwgQWNlIGhpZ2gnXG4gICwgJ1NlYXQgMzogRmlzY2hlcnNpdG8gKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIHNob3dlZCBbUWggQWNdIGFuZCBsb3N0IHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIE5pbmVzJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1NyAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE1NTgzNDI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMTowMjoxMCBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDM2MCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTMxNjYgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg5NTg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICgzNzE5IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbNmQgVGNdJ1xuICAsICdzYXBpbmhvMTAwMTogcmFpc2VzIDMwMCB0byA2MDAnXG4gICwgJ3NoaWJhYmE0MjA6IGZvbGRzJ1xuICAsICdoZWxkOiBmb2xkcydcbiAgLCAnVGhvcmUgSDogY2FsbHMgMzAwJ1xuICAsICcqKiogRkxPUCAqKiogWzJoIDdkIDlkXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdzYXBpbmhvMTAwMTogYmV0cyA3MjUnXG4gICwgJ1Rob3JlIEg6IGNhbGxzIDcyNSdcbiAgLCAnKioqIFRVUk4gKioqIFsyaCA3ZCA5ZF0gW0tkXSdcbiAgLCAnVGhvcmUgSDogY2hlY2tzJ1xuICAsICdzYXBpbmhvMTAwMTogY2hlY2tzJ1xuICAsICcqKiogUklWRVIgKioqIFsyaCA3ZCA5ZCBLZF0gWzVoXSdcbiAgLCAnVGhvcmUgSDogYmV0cyA2MDAnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnVW5jYWxsZWQgYmV0ICg2MDApIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDI5MDAgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDI5MDAgfCBSYWtlIDAnXG4gICwgJ0JvYXJkIFsyaCA3ZCA5ZCBLZCA1aF0nXG4gICwgJ1NlYXQgMTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMjkwMCknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgZm9sZGVkIG9uIHRoZSBSaXZlcidcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNTggKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNTUwNzY5OiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDE6MDE6NDAgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoMTA2ODUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEzMTkxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoMTU4MiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDc0NzggaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDM4OTQgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2hpYmFiYTQyMDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdoZWxkOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzdkIFRkXSdcbiAgLCAnVGhvcmUgSDogZm9sZHMnXG4gICwgJ0x1a2F6NTE2OiByYWlzZXMgMTI1NyB0byAxNTU3IGFuZCBpcyBhbGwtaW4nXG4gICwgJ3NhcGluaG8xMDAxOiBjYWxscyAxNTU3J1xuICAsICdzaGliYWJhNDIwOiBmb2xkcydcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJyoqKiBGTE9QICoqKiBbNGMgN3MgM2RdJ1xuICAsICcqKiogVFVSTiAqKiogWzRjIDdzIDNkXSBbQWRdJ1xuICAsICcqKiogUklWRVIgKioqIFs0YyA3cyAzZCBBZF0gW0pkXSdcbiAgLCAnKioqIFNIT1cgRE9XTiAqKionXG4gICwgJ0x1a2F6NTE2OiBzaG93cyBbSmggUWhdIChhIHBhaXIgb2YgSmFja3MpJ1xuICAsICdzYXBpbmhvMTAwMTogc2hvd3MgWzdoIEFzXSAodHdvIHBhaXIsIEFjZXMgYW5kIFNldmVucyknXG4gICwgJ3NhcGluaG8xMDAxIGNvbGxlY3RlZCAzNjg5IGZyb20gcG90J1xuICAsICdMdWthejUxNiBmaW5pc2hlZCB0aGUgdG91cm5hbWVudCBpbiAxMXRoIHBsYWNlJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCAzNjg5IHwgUmFrZSAwJ1xuICAsICdCb2FyZCBbNGMgN3MgM2QgQWQgSmRdJ1xuICAsICdTZWF0IDE6IGhlbGQgKGJpZyBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICdTZWF0IDI6IFRob3JlIEggZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2IHNob3dlZCBbSmggUWhdIGFuZCBsb3N0IHdpdGggYSBwYWlyIG9mIEphY2tzJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIChidXR0b24pIHNob3dlZCBbN2ggQXNdIGFuZCB3b24gKDM2ODkpIHdpdGggdHdvIHBhaXIsIEFjZXMgYW5kIFNldmVucydcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA1OSAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE1NDU0MzA6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMTowMToxOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzUgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDcxMCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTI2NDEgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgxNjA3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoNzY1MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDIxOSBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgWzJjIDRoXSdcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1Rob3JlIEg6IHJhaXNlcyAzMDAgdG8gNjAwJ1xuICAsICdMdWthejUxNjogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMzAwKSByZXR1cm5lZCB0byBUaG9yZSBIJ1xuICAsICdUaG9yZSBIIGNvbGxlY3RlZCA4NzUgZnJvbSBwb3QnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBoZWxkIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIGNvbGxlY3RlZCAoODc1KSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoYnV0dG9uKSBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKHNtYWxsIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYwICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTUyOTQ5NjogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFZJSUkgKDE1MC8zMDApIC0gMjAxNi8wMy8wMSAxOjAwOjE3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDJcXCcgOS1tYXggU2VhdCAjMiBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IGhlbGQgKDEwMTYwIGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxMjY2NiBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgKDE3ODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg3OTc4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICg0MjQ0IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdMdWthejUxNjogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2hpYmFiYTQyMDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ3NhcGluaG8xMDAxOiBwb3N0cyBiaWcgYmxpbmQgMzAwJ1xuICAsICcqKiogSE9MRSBDQVJEUyAqKionXG4gICwgJ0RlYWx0IHRvIGhlbGQgW0FoIDhkXSdcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA0NzcgdG8gNzc3J1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoNDc3KSByZXR1cm5lZCB0byBoZWxkJ1xuICAsICdoZWxkIGNvbGxlY3RlZCA4NzUgZnJvbSBwb3QnXG4gICwgJ2hlbGQ6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDg3NSB8IFJha2UgMCdcbiAgLCAnU2VhdCAxOiBoZWxkIGNvbGxlY3RlZCAoODc1KSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJydcbiAgLCAnJ1xuICAsICcqKioqKioqKioqKiAjIDYxICoqKioqKioqKioqKioqJ1xuICAsICdQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTQ1MTk4NTogVG91cm5hbWVudCAjMTQ5NTE5MjYzMCwgJDAuOTErJDAuMDkgVVNEIEhvbGRcXCdlbSBObyBMaW1pdCAtIExldmVsIFZJSUkgKDE1MC8zMDApIC0gMjAxNi8wMy8wMSAwOjU0OjU3IEVUJ1xuICAsICdUYWJsZSBcXCcxNDk1MTkyNjMwIDJcXCcgOS1tYXggU2VhdCAjMSBpcyB0aGUgYnV0dG9uJ1xuICAsICdTZWF0IDE6IGhlbGQgKDk2MTAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDI6IFRob3JlIEggKDEyODQxIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoMjEwNyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgKDgwMDMgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgKDQyNjkgaW4gY2hpcHMpJ1xuICAsICdoZWxkOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ0x1a2F6NTE2OiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnc2FwaW5obzEwMDE6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnVGhvcmUgSDogcG9zdHMgc21hbGwgYmxpbmQgMTUwJ1xuICAsICdMdWthejUxNjogcG9zdHMgYmlnIGJsaW5kIDMwMCdcbiAgLCAnKioqIEhPTEUgQ0FSRFMgKioqJ1xuICAsICdEZWFsdCB0byBoZWxkIFs4cyBKZF0nXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyA0NzcgdG8gNzc3J1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdVbmNhbGxlZCBiZXQgKDQ3NykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgODc1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA4NzUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoYnV0dG9uKSBjb2xsZWN0ZWQgKDg3NSknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCA1OiBMdWthejUxNiAoYmlnIGJsaW5kKSBmb2xkZWQgYmVmb3JlIEZsb3AnXG4gICwgJ1NlYXQgNjogc2FwaW5obzEwMDEgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDc6IHNoaWJhYmE0MjAgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA2MiAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE0Mzk5OTc6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMDo1NDoxMyBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzcgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICgxMDMwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTIwNzUgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgyMTMyIGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoODAyOCBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDI5NCBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdoZWxkOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ1Rob3JlIEg6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbUWQgVHNdJ1xuICAsICdMdWthejUxNjogZm9sZHMnXG4gICwgJ3NhcGluaG8xMDAxOiBmb2xkcydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ2hlbGQ6IHJhaXNlcyAzNjYgdG8gNjY2J1xuICAsICdUaG9yZSBIOiByYWlzZXMgMTEzODQgdG8gMTIwNTAgYW5kIGlzIGFsbC1pbidcbiAgLCAnaGVsZDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTEzODQpIHJldHVybmVkIHRvIFRob3JlIEgnXG4gICwgJ1Rob3JlIEggY29sbGVjdGVkIDE0NTcgZnJvbSBwb3QnXG4gICwgJ1Rob3JlIEg6IGRvZXNuXFwndCBzaG93IGhhbmQnXG4gICwgJyoqKiBTVU1NQVJZICoqKidcbiAgLCAnVG90YWwgcG90IDE0NTcgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoc21hbGwgYmxpbmQpIGZvbGRlZCBiZWZvcmUgRmxvcCdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIIChiaWcgYmxpbmQpIGNvbGxlY3RlZCAoMTQ1NyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnJ1xuICAsICcnXG4gICwgJyoqKioqKioqKioqICMgNjMgKioqKioqKioqKioqKionXG4gICwgJ1Bva2VyU3RhcnMgSGFuZCAjMTQ5NjUxNDMwMDYzOiBUb3VybmFtZW50ICMxNDk1MTkyNjMwLCAkMC45MSskMC4wOSBVU0QgSG9sZFxcJ2VtIE5vIExpbWl0IC0gTGV2ZWwgVklJSSAoMTUwLzMwMCkgLSAyMDE2LzAzLzAxIDA6NTM6MzYgRVQnXG4gICwgJ1RhYmxlIFxcJzE0OTUxOTI2MzAgMlxcJyA5LW1heCBTZWF0ICM2IGlzIHRoZSBidXR0b24nXG4gICwgJ1NlYXQgMTogaGVsZCAoOTkwMSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCAoMTIxMDAgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDU6IEx1a2F6NTE2ICgyMTU3IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA2OiBzYXBpbmhvMTAwMSAoODA1MyBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNzogc2hpYmFiYTQyMCAoNDYxOSBpbiBjaGlwcyknXG4gICwgJ2hlbGQ6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdUaG9yZSBIOiBwb3N0cyB0aGUgYW50ZSAyNSdcbiAgLCAnTHVrYXo1MTY6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzYXBpbmhvMTAwMTogcG9zdHMgdGhlIGFudGUgMjUnXG4gICwgJ3NoaWJhYmE0MjA6IHBvc3RzIHRoZSBhbnRlIDI1J1xuICAsICdzaGliYWJhNDIwOiBwb3N0cyBzbWFsbCBibGluZCAxNTAnXG4gICwgJ2hlbGQ6IHBvc3RzIGJpZyBibGluZCAzMDAnXG4gICwgJyoqKiBIT0xFIENBUkRTICoqKidcbiAgLCAnRGVhbHQgdG8gaGVsZCBbQWQgOWhdJ1xuICAsICdUaG9yZSBIOiBmb2xkcydcbiAgLCAnTHVrYXo1MTY6IGZvbGRzJ1xuICAsICdzYXBpbmhvMTAwMTogZm9sZHMnXG4gICwgJ3NoaWJhYmE0MjA6IGNhbGxzIDE1MCdcbiAgLCAnaGVsZDogcmFpc2VzIDEwMzMgdG8gMTMzMydcbiAgLCAnc2hpYmFiYTQyMDogZm9sZHMnXG4gICwgJ1VuY2FsbGVkIGJldCAoMTAzMykgcmV0dXJuZWQgdG8gaGVsZCdcbiAgLCAnaGVsZCBjb2xsZWN0ZWQgNzI1IGZyb20gcG90J1xuICAsICdoZWxkOiBkb2VzblxcJ3Qgc2hvdyBoYW5kJ1xuICAsICcqKiogU1VNTUFSWSAqKionXG4gICwgJ1RvdGFsIHBvdCA3MjUgfCBSYWtlIDAnXG4gICwgJ1NlYXQgMTogaGVsZCAoYmlnIGJsaW5kKSBjb2xsZWN0ZWQgKDcyNSknXG4gICwgJ1NlYXQgMjogVGhvcmUgSCBmb2xkZWQgYmVmb3JlIEZsb3AgKGRpZG5cXCd0IGJldCknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgZm9sZGVkIGJlZm9yZSBGbG9wIChkaWRuXFwndCBiZXQpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxIChidXR0b24pIGZvbGRlZCBiZWZvcmUgRmxvcCAoZGlkblxcJ3QgYmV0KSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwIChzbWFsbCBibGluZCkgZm9sZGVkIGJlZm9yZSBGbG9wJ1xuICAsICcnXG4gICwgJydcbiAgLCAnKioqKioqKioqKiogIyA2NCAqKioqKioqKioqKioqKidcbiAgLCAnUG9rZXJTdGFycyBIYW5kICMxNDk2NTE0MTIxMzI6IFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsICQwLjkxKyQwLjA5IFVTRCBIb2xkXFwnZW0gTm8gTGltaXQgLSBMZXZlbCBWSUlJICgxNTAvMzAwKSAtIDIwMTYvMDMvMDEgMDo1MjoyOSBFVCdcbiAgLCAnVGFibGUgXFwnMTQ5NTE5MjYzMCAyXFwnIDktbWF4IFNlYXQgIzUgaXMgdGhlIGJ1dHRvbidcbiAgLCAnU2VhdCAxOiBoZWxkICg4MDg1IGluIGNoaXBzKSdcbiAgLCAnU2VhdCAyOiBUaG9yZSBIICgxMzM5MSBpbiBjaGlwcyknXG4gICwgJ1NlYXQgNTogTHVrYXo1MTYgKDIxODIgaW4gY2hpcHMpJ1xuICAsICdTZWF0IDY6IHNhcGluaG8xMDAxICg4MjI4IGluIGNoaXBzKSdcbiAgLCAnU2VhdCA3OiBzaGliYWJhNDIwICg0OTQ0IGluIGNoaXBzKSdcbiAgLCAnaGVsZDogcG9zdHMgdGhlIGFudGUgMjUnXG5dLmpvaW4oJ1xcbicpXG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IGluamVjdFN0eWxlICAgICA9IHJlcXVpcmUoJy4vbGliL2luamVjdC1zdHlsZScpXG5jb25zdCB0ZW1wbGF0ZXMgICAgICAgPSByZXF1aXJlKCcuL2xpYi90ZW1wbGF0ZXMnKVxuY29uc3Qgc29ydCAgICAgICAgICAgID0gcmVxdWlyZSgnLi9saWIvc29ydCcpXG5jb25zdCBjc3MgICAgICAgICAgICAgPSB0ZW1wbGF0ZXMuY3NzXG5jb25zdCBmaWx0ZXJDc3MgICAgICAgPSB0ZW1wbGF0ZXMuZmlsdGVyQ3NzXG5jb25zdCBzZWxlY3RQbGF5ZXJDc3MgPSB0ZW1wbGF0ZXMuc2VsZWN0UGxheWVyQ3NzXG5jb25zdCB1aUZpbHRlciAgICAgICAgPSB0ZW1wbGF0ZXMudWlGaWx0ZXJcbmNvbnN0IGhlYWQgICAgICAgICAgICA9IHRlbXBsYXRlcy5oZWFkKHsgY3NzOiBjc3MgfSlcbmNvbnN0IGhvbGRlbSAgICAgICAgICA9IHRlbXBsYXRlcy5ob2xkZW1cblxuZnVuY3Rpb24gb25lRGVjaW1hbCAoeCkge1xuICByZXR1cm4gKHggfHwgMCkudG9GaXhlZCgxKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdWl0IChzKSB7XG4gIHN3aXRjaCAocykge1xuICAgIGNhc2UgJ3MnOiByZXR1cm4gJ+KZoCdcbiAgICBjYXNlICdoJzogcmV0dXJuICfimaUnXG4gICAgY2FzZSAnZCc6IHJldHVybiAn4pmmJ1xuICAgIGNhc2UgJ2MnOiByZXR1cm4gJ+KZoydcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJDYXJkIChjKSB7XG4gIGlmICh0eXBlb2YgYyA9PT0gJ3VuZGVmaW5lZCcgfHwgYy5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgY29uc3Qgc3VpdCA9IHJlbmRlclN1aXQoY1sxXSlcbiAgcmV0dXJuICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXZhbHVlXCI+J1xuICAgICAgICAgICAgKyBjWzBdICtcbiAgICAgICAgICAnPC9zcGFuPicgK1xuICAgICAgICAgICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXN1aXQgJyArIGNbMV0gKyAnXCI+J1xuICAgICAgICAgICAgKyBzdWl0ICtcbiAgICAgICAgICAnPC9zcGFuPidcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ2FyZHMgKGNhcmRzKSB7XG4gIGlmICghY2FyZHMpIHJldHVybiAnJ1xuICBmdW5jdGlvbiByZW5kZXIgKGFjYywgaykge1xuICAgIGFjY1trXSA9IHJlbmRlckNhcmQoY2FyZHNba10pXG4gICAgcmV0dXJuIGFjY1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhjYXJkcykucmVkdWNlKHJlbmRlciwge30pXG59XG5cbmZ1bmN0aW9uIHNob3J0ZW5BY3Rpb25UeXBlICh0eXBlKSB7XG4gIHJldHVybiAgdHlwZSA9PT0gJ2ZvbGQnICAgICA/ICdGJ1xuICAgICAgICA6IHR5cGUgPT09ICdjaGVjaycgICAgPyAnWCdcbiAgICAgICAgOiB0eXBlID09PSAnY2FsbCcgICAgID8gJ0MnXG4gICAgICAgIDogdHlwZSA9PT0gJ2JldCcgICAgICA/ICdCJ1xuICAgICAgICA6IHR5cGUgPT09ICdyYWlzZScgICAgPyAnUidcbiAgICAgICAgOiB0eXBlID09PSAnY29sbGVjdCcgID8gJ1cnXG4gICAgICAgIDogKGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gYWN0aW9uIHR5cGUnLCB0eXBlKSwgJz8nKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJlZXQgKGFjdGlvbnMsIGluZGVudCkge1xuICBsZXQgcyA9IGluZGVudCA/ICdfX19fXyAnIDogJydcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYSA9IGFjdGlvbnNbaV1cbiAgICAvLyBpZ25vcmUgdW5jYWxsZWQgYmV0cyByZXR1cm5lZFxuICAgIGlmIChhLnR5cGUgPT09ICdiZXQtcmV0dXJuZWQnKSBjb250aW51ZVxuICAgIHMgKz0gIHNob3J0ZW5BY3Rpb25UeXBlKGEudHlwZSkgKyAnICdcbiAgICAgICAgKyAoYS5oYXNPd25Qcm9wZXJ0eSgncmF0aW8nKVxuICAgICAgICAgICAgPyBvbmVEZWNpbWFsKGEucmF0aW8pXG4gICAgICAgICAgICA6ICcgICAnKVxuICAgICAgICArIChhLmFsbGluID8gJyBBJyA6ICcnKVxuICAgICAgICArICcgJ1xuICB9XG4gIHJldHVybiBzLnRyaW0oKVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQbGF5ZXJOYW1lIChuKSB7XG4gIHJldHVybiBuLnJlcGxhY2UoLyAvZywgJ18nKVxufVxuXG5mdW5jdGlvbiBuYW1lUGxheWVyIChwKSB7IHJldHVybiBwLm5hbWUgfVxuXG5mdW5jdGlvbiByZW5kZXJQbGF5ZXIgKHApIHtcbiAgY29uc3QgaW5mbyA9IHtcbiAgICAgIHBvcyAgICAgICAgICAgIDogKHAucG9zIHx8ICc/PycpLnRvVXBwZXJDYXNlKClcbiAgICAsIG5hbWUgICAgICAgICAgIDogcC5uYW1lXG4gICAgLCBub3JtYWxpemVkTmFtZSA6IG5vcm1hbGl6ZVBsYXllck5hbWUocC5uYW1lKVxuICAgICwgY2FyZHMgICAgICAgICAgOiBwLmNhcmRzXG4gICAgLCByZW5kZXJlZENhcmRzICA6IHJlbmRlckNhcmRzKHAuY2FyZHMpXG4gICAgLCBtICAgICAgICAgICAgICA6IHAubVxuICAgICwgcHJlZmxvcCAgICAgICAgOiByZW5kZXJTdHJlZXQocC5wcmVmbG9wLCBwLmJiIHx8IHAuc2IpXG4gICAgLCBmbG9wICAgICAgICAgICA6IHJlbmRlclN0cmVldChwLmZsb3AsIGZhbHNlKVxuICAgICwgdHVybiAgICAgICAgICAgOiByZW5kZXJTdHJlZXQocC50dXJuLCBmYWxzZSlcbiAgICAsIHJpdmVyICAgICAgICAgIDogcmVuZGVyU3RyZWV0KHAucml2ZXIsIGZhbHNlKVxuICAgICwgc2hvd2Rvd24gICAgICAgOiByZW5kZXJTdHJlZXQocC5zaG93ZG93biwgZmFsc2UpXG4gIH1cbiAgbGV0IHBsYXllckFjdGl2aXR5ID0gaW5mby5ub3JtYWxpemVkTmFtZVxuICBpZiAocC5pbnZlc3RlZCkgcGxheWVyQWN0aXZpdHkgKz0gJyBpbnZlc3RlZCdcbiAgaWYgKHAuc2F3RmxvcCkgcGxheWVyQWN0aXZpdHkgKz0gJyBzYXdGbG9wJ1xuICBpbmZvLnBsYXllckFjdGl2aXR5ID0gcGxheWVyQWN0aXZpdHlcbiAgcmV0dXJuIGluZm9cbn1cblxuZnVuY3Rpb24gcmVuZGVySW5mbyAoYW5hbHl6ZWQsIHBsYXllcnMpIHtcbiAgY29uc3QgaW5mbyA9IHtcbiAgICAgIGJiICAgICAgIDogYW5hbHl6ZWQuYmJcbiAgICAsIHNiICAgICAgIDogYW5hbHl6ZWQuc2JcbiAgICAsIGFudGUgICAgIDogYW5hbHl6ZWQuYW50ZVxuICAgICwgYm9hcmQgICAgOiBhbmFseXplZC5ib2FyZFxuICAgICwgeWVhciAgICAgOiBhbmFseXplZC55ZWFyXG4gICAgLCBtb250aCAgICA6IGFuYWx5emVkLm1vbnRoXG4gICAgLCBkYXkgICAgICA6IGFuYWx5emVkLmRheVxuICAgICwgaG91ciAgICAgOiBhbmFseXplZC5ob3VyXG4gICAgLCBtaW4gICAgICA6IGFuYWx5emVkLm1pblxuICAgICwgc2VjICAgICAgOiBhbmFseXplZC5zZWNcbiAgICAsIGdhbWV0eXBlIDogYW5hbHl6ZWQuZ2FtZXR5cGVcbiAgICAsIGdhbWVubyAgIDogYW5hbHl6ZWQuZ2FtZW5vXG4gICAgLCBoYW5kaWQgICA6IGFuYWx5emVkLmhhbmRpZFxuICB9XG5cbiAgaW5mby5hbnlBY3Rpdml0eSA9ICcnXG4gIGluZm8ucGxheWVyQWN0aXZpdHkgPSAnJ1xuXG4gIGlmIChhbmFseXplZC5hbnlJbnZlc3RlZCkgaW5mby5hbnlBY3Rpdml0eSArPSAnIGFueS1pbnZlc3RlZCAnXG4gIGlmIChhbmFseXplZC5hbnlTYXdGbG9wKSBpbmZvLmFueUFjdGl2aXR5ICs9ICcgYW55LXNhd0Zsb3AgJ1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXJzW2ldXG4gICAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZVBsYXllck5hbWUocC5uYW1lKVxuICAgIGluZm8ucGxheWVyQWN0aXZpdHkgKz0gJyAnICsgbmFtZVxuICAgIGlmIChwLmludmVzdGVkKSBpbmZvLnBsYXllckFjdGl2aXR5ICs9ICAnICcgKyBuYW1lICsgJy1pbnZlc3RlZCdcbiAgICBpZiAocC5zYXdGbG9wKSBpbmZvLnBsYXllckFjdGl2aXR5ICs9ICAnICcgKyBuYW1lICsgJy1zYXdGbG9wJ1xuICB9XG4gIHJldHVybiBpbmZvXG59XG5cbmV4cG9ydHMuY3NzICAgICAgID0gY3NzKClcbmV4cG9ydHMuZmlsdGVyQ3NzID0gZmlsdGVyQ3NzXG5leHBvcnRzLmhlYWQgICAgICA9IGhlYWRcblxuZXhwb3J0cy5pbmplY3RTdHlsZSA9IGluamVjdFN0eWxlXG5cbmV4cG9ydHMuZmlsdGVySGFuZHMgPSBmdW5jdGlvbiBmaWx0ZXJIYW5kcyAob3B0cykge1xuICAvLyBjcmVhdGUgY2xhc3MgZGVmaW5pdGlvbnMgdG8gdHJpZ2dlciB3aGljaCBwbGF5ZXIgcm93cyBhbmQgd2hpY2ggaGFuZHMgYXJlIHNob3duXG4gIGxldCBoYW5kRmlsdGVyID0gJydcbiAgbGV0IHBsYXllcnNGaWx0ZXIgPSAnJ1xuICBpZiAob3B0cy5wbGF5ZXJzKSB7XG4gICAgaGFuZEZpbHRlciArPSAnLmFueS0nICsgb3B0cy5wbGF5ZXJzLmZpbHRlclxuICAgIHBsYXllcnNGaWx0ZXIgPSAnLicgKyBvcHRzLnBsYXllcnMuZmlsdGVyXG4gIH1cbiAgaWYgKG9wdHMuaGFuZCkge1xuICAgIGhhbmRGaWx0ZXIgKz0gJy4nICsgb3B0cy5oYW5kLndobyArICctJyArIG9wdHMuaGFuZC5maWx0ZXJcbiAgfVxuICBjb25zdCBmaWx0ZXIgPSB7IGhhbmQ6IGhhbmRGaWx0ZXIsIHBsYXllcnM6IHBsYXllcnNGaWx0ZXIgfVxuICBpbmplY3RTdHlsZShmaWx0ZXJDc3MoZmlsdGVyKSwgZG9jdW1lbnQsICdoYW5kLWZpbHRlcicpXG59XG5cbmV4cG9ydHMuc2VsZWN0UGxheWVyID0gZnVuY3Rpb24gc2VsZWN0UGxheWVyIChzZWxlY3RlZCwgbmFtZSkge1xuICBpbmplY3RTdHlsZShzZWxlY3RQbGF5ZXJDc3MoeyBzZWxlY3RlZDogc2VsZWN0ZWQsIG5hbWU6IG5hbWUgfSksIGRvY3VtZW50LCAncGxheWVyLXNlbGVjdCcpXG59XG5cbmNvbnN0IHByZXBhcmVSZW5kZXIgPSBleHBvcnRzLnByZXBhcmVSZW5kZXIgPSBmdW5jdGlvbiBwcmVwYXJlUmVuZGVyIChhbmFseXplZCkge1xuICBjb25zdCBpbmZvID0ge1xuICAgICAgaW5mbyAgICAgICAgICAgIDogcmVuZGVySW5mbyhhbmFseXplZC5pbmZvLCBhbmFseXplZC5wbGF5ZXJzKVxuICAgICwgdGFibGUgICAgICAgICAgIDogYW5hbHl6ZWQudGFibGVcbiAgICAsIGJvYXJkICAgICAgICAgICA6IGFuYWx5emVkLmJvYXJkXG4gICAgLCByZW5kZXJlZEJvYXJkICAgOiByZW5kZXJDYXJkcyhhbmFseXplZC5ib2FyZClcbiAgICAsIHBsYXllcnMgICAgICAgICA6IGFuYWx5emVkLnBsYXllcnNcbiAgICAsIHJlbmRlcmVkUGxheWVycyA6IGFuYWx5emVkLnBsYXllcnMubWFwKHJlbmRlclBsYXllcilcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgICBpbmZvOiBpbmZvXG4gICAgLCBwbGF5ZXJzOiBhbmFseXplZC5wbGF5ZXJzLm1hcChuYW1lUGxheWVyKVxuICB9XG59XG5cbmV4cG9ydHMucmVuZGVyID0gZnVuY3Rpb24gcmVuZGVyIChhbmFseXplZCkge1xuICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVSZW5kZXIoYW5hbHl6ZWQpXG4gIHJldHVybiB7XG4gICAgICBodG1sOiBob2xkZW0ocHJlcGFyZWQuaW5mbylcbiAgICAsIHBsYXllcnM6IHByZXBhcmVkLnBsYXllcnNcbiAgfVxufVxuXG5leHBvcnRzLm5vcm1hbGl6ZVBsYXllck5hbWUgPSBub3JtYWxpemVQbGF5ZXJOYW1lXG5cbmV4cG9ydHMucGFnZWlmeSA9IGZ1bmN0aW9uIHBhZ2VpZnkgKHJlbmRlcmVkSGFuZHMpIHtcbiAgY29uc3QgaHRtbCA9XG4gICAgICBoZWFkXG4gICAgKyAnPGJvZHk+J1xuICAgICAgKyByZW5kZXJlZEhhbmRzXG4gICAgKyAnPC9ib2R5PidcbiAgcmV0dXJuIGh0bWxcbn1cblxuZXhwb3J0cy5zb3J0QnlEYXRlVGltZSA9IHNvcnQuYnlEYXRlVGltZVxuXG5leHBvcnRzLnJlbmRlckZpbHRlciA9IGZ1bmN0aW9uIHJlbmRlckZpbHRlciAocGxheWVycywgaGVybykge1xuICBmdW5jdGlvbiBwbGF5ZXJJbmZvIChwKSB7XG4gICAgcmV0dXJuIHsgbmFtZTogcCwgaXNIZXJvOiBwID09PSBoZXJvIH1cbiAgfVxuICByZXR1cm4gdWlGaWx0ZXIoeyBwbGF5ZXJzOiBwbGF5ZXJzLm1hcChwbGF5ZXJJbmZvKSB9KVxufVxuXG4vLyBUZXN0XG4vKiBlc2xpbnQtZGlzYWJsZSBuby11bnVzZWQtdmFycyAqL1xuZnVuY3Rpb24gaW5zcCAob2JqLCBkZXB0aCkge1xuICBjb25zb2xlLmVycm9yKHJlcXVpcmUoJ3V0aWwnKS5pbnNwZWN0KG9iaiwgZmFsc2UsIGRlcHRoIHx8IDUsIGZhbHNlKSlcbn1cbmZ1bmN0aW9uIGluc3BlY3QgKG9iaiwgZGVwdGgpIHtcbiAgY29uc29sZS5lcnJvcihyZXF1aXJlKCd1dGlsJykuaW5zcGVjdChvYmosIGZhbHNlLCBkZXB0aCB8fCA1LCB0cnVlKSlcbn1cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG5cbmNvbnN0IGFjdGlvbm9uYWxsID0gZXhwb3J0cy5yZW5kZXIocmVxdWlyZSgnLi90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uJykpXG5jb25zdCBhbGxpbiA9IGV4cG9ydHMucmVuZGVyKHJlcXVpcmUoJy4vdGVzdC9maXh0dXJlcy9ob2xkZW0vYWxsaW4tcHJlZmxvcC5qc29uJykpXG5jb25zdCBodG1sID0gZXhwb3J0cy5wYWdlaWZ5KGFjdGlvbm9uYWxsICsgYWxsaW4pXG4vLyBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihfX2Rpcm5hbWUsICd0ZXN0Lmh0bWwnKSwgaHRtbCwgJ3V0ZjgnKVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBoYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpXG5jb25zdCBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJylcbmhlbHBlcnMoaGFuZGxlYmFycylcblxuZXhwb3J0cy5oZWFkICAgICAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvaGVhZC5oYnMnKVxuZXhwb3J0cy5jc3MgICAgICAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvc3R5bGUuaGJzJylcbmV4cG9ydHMuZmlsdGVyQ3NzICAgICAgID0gcmVxdWlyZSgnLi4vdGVtcGxhdGVzL3N0eWxlLWZpbHRlci5oYnMnKVxuZXhwb3J0cy5zZWxlY3RQbGF5ZXJDc3MgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvc3R5bGUtc2VsZWN0LXBsYXllci5oYnMnKVxuZXhwb3J0cy51aUZpbHRlciAgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvdWktZmlsdGVyLmhicycpXG5leHBvcnRzLmhvbGRlbSAgICAgICAgICA9IHJlcXVpcmUoJy4uL3RlbXBsYXRlcy9ob2xkZW0uaGJzJylcbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiB0d29EaWdpdHMgKG4pIHtcbiAgcmV0dXJuICgnMCcgKyBuKS5zbGljZSgtMilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBoZWxwZXJzIChoYW5kbGViYXJzKSB7XG4gIGhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ2lmdmFsdWUnLCBmdW5jdGlvbiAoY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5oYXNoLnZhbHVlID09PSBjb25kaXRpb25hbCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuZm4odGhpcylcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKVxuICAgIH1cbiAgfSlcbiAgaGFuZGxlYmFycy5yZWdpc3RlckhlbHBlcigndHdvZGlnaXRzJywgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gdHdvRGlnaXRzKG9wdGlvbnMuZm4odGhpcykpXG4gIH0pXG59XG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gaW5qZWN0U3R5bGVUYWcgKGRvY3VtZW50LCBpZCkge1xuICBsZXQgc3R5bGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZClcblxuICBpZiAoIXN0eWxlKSB7XG4gICAgY29uc3QgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF1cbiAgICBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJylcbiAgICBpZiAoaWQgIT0gbnVsbCkgc3R5bGUuaWQgPSBpZFxuICAgIGhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpXG4gIH1cblxuICByZXR1cm4gc3R5bGVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmplY3RTdHlsZSAoY3NzLCBkb2N1bWVudCwgaWQpIHtcbiAgY29uc3Qgc3R5bGUgPSBpbmplY3RTdHlsZVRhZyhkb2N1bWVudCwgaWQpXG4gIGlmIChzdHlsZS5zdHlsZVNoZWV0KSB7XG4gICAgc3R5bGUuc3R5bGVTaGVldC5jc3NUZXh0ID0gY3NzXG4gIH0gZWxzZSB7XG4gICAgc3R5bGUuaW5uZXJIVE1MID0gY3NzXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5mdW5jdGlvbiBieURhdGVUaW1lIChoMSwgaDIpIHtcbiAgY29uc3QgaTEgPSBoMS5pbmZvXG4gIGNvbnN0IGkyID0gaDIuaW5mb1xuICBpZiAoaTEueWVhciA8IGkyLnllYXIpICAgcmV0dXJuIC0xXG4gIGlmIChpMS55ZWFyID4gaTIueWVhcikgICByZXR1cm4gIDFcbiAgaWYgKGkxLm1vbnRoIDwgaTIubW9udGgpIHJldHVybiAtMVxuICBpZiAoaTEubW9udGggPiBpMi5tb250aCkgcmV0dXJuICAxXG4gIGlmIChpMS5kYXkgPCBpMi5kYXkpICAgICByZXR1cm4gLTFcbiAgaWYgKGkxLmRheSA+IGkyLmRheSkgICAgIHJldHVybiAgMVxuICBpZiAoaTEuaG91ciA8IGkyLmhvdXIpICAgcmV0dXJuIC0xXG4gIGlmIChpMS5ob3VyID4gaTIuaG91cikgICByZXR1cm4gIDFcbiAgaWYgKGkxLm1pbiA8IGkyLm1pbikgICAgIHJldHVybiAtMVxuICBpZiAoaTEubWluID4gaTIubWluKSAgICAgcmV0dXJuICAxXG4gIGlmIChpMS5zZWMgPCBpMi5zZWMpICAgICByZXR1cm4gLTFcbiAgaWYgKGkxLnNlYyA+IGkyLnNlYykgICAgIHJldHVybiAgMVxuICByZXR1cm4gMFxufVxuXG5leHBvcnRzLmJ5RGF0ZVRpbWUgPSBmdW5jdGlvbiBzb3J0QnlEYXRlVGltZSAoYW5hbHl6ZWQpIHtcbiAgcmV0dXJuIGFuYWx5emVkLnNvcnQoYnlEYXRlVGltZSlcbn1cblxuIiwiIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0J1xuICAgICYmIHR5cGVvZiBhcmcuY29weSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcuZmlsbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcucmVhZFVJbnQ4ID09PSAnZnVuY3Rpb24nO1xufSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cbiIsImltcG9ydCAqIGFzIGJhc2UgZnJvbSAnLi9oYW5kbGViYXJzL2Jhc2UnO1xuXG4vLyBFYWNoIG9mIHRoZXNlIGF1Z21lbnQgdGhlIEhhbmRsZWJhcnMgb2JqZWN0LiBObyBuZWVkIHRvIHNldHVwIGhlcmUuXG4vLyAoVGhpcyBpcyBkb25lIHRvIGVhc2lseSBzaGFyZSBjb2RlIGJldHdlZW4gY29tbW9uanMgYW5kIGJyb3dzZSBlbnZzKVxuaW1wb3J0IFNhZmVTdHJpbmcgZnJvbSAnLi9oYW5kbGViYXJzL3NhZmUtc3RyaW5nJztcbmltcG9ydCBFeGNlcHRpb24gZnJvbSAnLi9oYW5kbGViYXJzL2V4Y2VwdGlvbic7XG5pbXBvcnQgKiBhcyBVdGlscyBmcm9tICcuL2hhbmRsZWJhcnMvdXRpbHMnO1xuaW1wb3J0ICogYXMgcnVudGltZSBmcm9tICcuL2hhbmRsZWJhcnMvcnVudGltZSc7XG5cbmltcG9ydCBub0NvbmZsaWN0IGZyb20gJy4vaGFuZGxlYmFycy9uby1jb25mbGljdCc7XG5cbi8vIEZvciBjb21wYXRpYmlsaXR5IGFuZCB1c2FnZSBvdXRzaWRlIG9mIG1vZHVsZSBzeXN0ZW1zLCBtYWtlIHRoZSBIYW5kbGViYXJzIG9iamVjdCBhIG5hbWVzcGFjZVxuZnVuY3Rpb24gY3JlYXRlKCkge1xuICBsZXQgaGIgPSBuZXcgYmFzZS5IYW5kbGViYXJzRW52aXJvbm1lbnQoKTtcblxuICBVdGlscy5leHRlbmQoaGIsIGJhc2UpO1xuICBoYi5TYWZlU3RyaW5nID0gU2FmZVN0cmluZztcbiAgaGIuRXhjZXB0aW9uID0gRXhjZXB0aW9uO1xuICBoYi5VdGlscyA9IFV0aWxzO1xuICBoYi5lc2NhcGVFeHByZXNzaW9uID0gVXRpbHMuZXNjYXBlRXhwcmVzc2lvbjtcblxuICBoYi5WTSA9IHJ1bnRpbWU7XG4gIGhiLnRlbXBsYXRlID0gZnVuY3Rpb24oc3BlYykge1xuICAgIHJldHVybiBydW50aW1lLnRlbXBsYXRlKHNwZWMsIGhiKTtcbiAgfTtcblxuICByZXR1cm4gaGI7XG59XG5cbmxldCBpbnN0ID0gY3JlYXRlKCk7XG5pbnN0LmNyZWF0ZSA9IGNyZWF0ZTtcblxubm9Db25mbGljdChpbnN0KTtcblxuaW5zdFsnZGVmYXVsdCddID0gaW5zdDtcblxuZXhwb3J0IGRlZmF1bHQgaW5zdDtcbiIsImltcG9ydCB7Y3JlYXRlRnJhbWUsIGV4dGVuZCwgdG9TdHJpbmd9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IEV4Y2VwdGlvbiBmcm9tICcuL2V4Y2VwdGlvbic7XG5pbXBvcnQge3JlZ2lzdGVyRGVmYXVsdEhlbHBlcnN9IGZyb20gJy4vaGVscGVycyc7XG5pbXBvcnQge3JlZ2lzdGVyRGVmYXVsdERlY29yYXRvcnN9IGZyb20gJy4vZGVjb3JhdG9ycyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFZFUlNJT04gPSAnNC4wLjUnO1xuZXhwb3J0IGNvbnN0IENPTVBJTEVSX1JFVklTSU9OID0gNztcblxuZXhwb3J0IGNvbnN0IFJFVklTSU9OX0NIQU5HRVMgPSB7XG4gIDE6ICc8PSAxLjAucmMuMicsIC8vIDEuMC5yYy4yIGlzIGFjdHVhbGx5IHJldjIgYnV0IGRvZXNuJ3QgcmVwb3J0IGl0XG4gIDI6ICc9PSAxLjAuMC1yYy4zJyxcbiAgMzogJz09IDEuMC4wLXJjLjQnLFxuICA0OiAnPT0gMS54LngnLFxuICA1OiAnPT0gMi4wLjAtYWxwaGEueCcsXG4gIDY6ICc+PSAyLjAuMC1iZXRhLjEnLFxuICA3OiAnPj0gNC4wLjAnXG59O1xuXG5jb25zdCBvYmplY3RUeXBlID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBIYW5kbGViYXJzRW52aXJvbm1lbnQoaGVscGVycywgcGFydGlhbHMsIGRlY29yYXRvcnMpIHtcbiAgdGhpcy5oZWxwZXJzID0gaGVscGVycyB8fCB7fTtcbiAgdGhpcy5wYXJ0aWFscyA9IHBhcnRpYWxzIHx8IHt9O1xuICB0aGlzLmRlY29yYXRvcnMgPSBkZWNvcmF0b3JzIHx8IHt9O1xuXG4gIHJlZ2lzdGVyRGVmYXVsdEhlbHBlcnModGhpcyk7XG4gIHJlZ2lzdGVyRGVmYXVsdERlY29yYXRvcnModGhpcyk7XG59XG5cbkhhbmRsZWJhcnNFbnZpcm9ubWVudC5wcm90b3R5cGUgPSB7XG4gIGNvbnN0cnVjdG9yOiBIYW5kbGViYXJzRW52aXJvbm1lbnQsXG5cbiAgbG9nZ2VyOiBsb2dnZXIsXG4gIGxvZzogbG9nZ2VyLmxvZyxcblxuICByZWdpc3RlckhlbHBlcjogZnVuY3Rpb24obmFtZSwgZm4pIHtcbiAgICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgICAgaWYgKGZuKSB7IHRocm93IG5ldyBFeGNlcHRpb24oJ0FyZyBub3Qgc3VwcG9ydGVkIHdpdGggbXVsdGlwbGUgaGVscGVycycpOyB9XG4gICAgICBleHRlbmQodGhpcy5oZWxwZXJzLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5oZWxwZXJzW25hbWVdID0gZm47XG4gICAgfVxuICB9LFxuICB1bnJlZ2lzdGVySGVscGVyOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgZGVsZXRlIHRoaXMuaGVscGVyc1tuYW1lXTtcbiAgfSxcblxuICByZWdpc3RlclBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcbiAgICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgICAgZXh0ZW5kKHRoaXMucGFydGlhbHMsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHlwZW9mIHBhcnRpYWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oYEF0dGVtcHRpbmcgdG8gcmVnaXN0ZXIgYSBwYXJ0aWFsIGNhbGxlZCBcIiR7bmFtZX1cIiBhcyB1bmRlZmluZWRgKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucGFydGlhbHNbbmFtZV0gPSBwYXJ0aWFsO1xuICAgIH1cbiAgfSxcbiAgdW5yZWdpc3RlclBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBkZWxldGUgdGhpcy5wYXJ0aWFsc1tuYW1lXTtcbiAgfSxcblxuICByZWdpc3RlckRlY29yYXRvcjogZnVuY3Rpb24obmFtZSwgZm4pIHtcbiAgICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgICAgaWYgKGZuKSB7IHRocm93IG5ldyBFeGNlcHRpb24oJ0FyZyBub3Qgc3VwcG9ydGVkIHdpdGggbXVsdGlwbGUgZGVjb3JhdG9ycycpOyB9XG4gICAgICBleHRlbmQodGhpcy5kZWNvcmF0b3JzLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5kZWNvcmF0b3JzW25hbWVdID0gZm47XG4gICAgfVxuICB9LFxuICB1bnJlZ2lzdGVyRGVjb3JhdG9yOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgZGVsZXRlIHRoaXMuZGVjb3JhdG9yc1tuYW1lXTtcbiAgfVxufTtcblxuZXhwb3J0IGxldCBsb2cgPSBsb2dnZXIubG9nO1xuXG5leHBvcnQge2NyZWF0ZUZyYW1lLCBsb2dnZXJ9O1xuIiwiaW1wb3J0IHJlZ2lzdGVySW5saW5lIGZyb20gJy4vZGVjb3JhdG9ycy9pbmxpbmUnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEZWZhdWx0RGVjb3JhdG9ycyhpbnN0YW5jZSkge1xuICByZWdpc3RlcklubGluZShpbnN0YW5jZSk7XG59XG5cbiIsImltcG9ydCB7ZXh0ZW5kfSBmcm9tICcuLi91dGlscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVyRGVjb3JhdG9yKCdpbmxpbmUnLCBmdW5jdGlvbihmbiwgcHJvcHMsIGNvbnRhaW5lciwgb3B0aW9ucykge1xuICAgIGxldCByZXQgPSBmbjtcbiAgICBpZiAoIXByb3BzLnBhcnRpYWxzKSB7XG4gICAgICBwcm9wcy5wYXJ0aWFscyA9IHt9O1xuICAgICAgcmV0ID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgICAgICAvLyBDcmVhdGUgYSBuZXcgcGFydGlhbHMgc3RhY2sgZnJhbWUgcHJpb3IgdG8gZXhlYy5cbiAgICAgICAgbGV0IG9yaWdpbmFsID0gY29udGFpbmVyLnBhcnRpYWxzO1xuICAgICAgICBjb250YWluZXIucGFydGlhbHMgPSBleHRlbmQoe30sIG9yaWdpbmFsLCBwcm9wcy5wYXJ0aWFscyk7XG4gICAgICAgIGxldCByZXQgPSBmbihjb250ZXh0LCBvcHRpb25zKTtcbiAgICAgICAgY29udGFpbmVyLnBhcnRpYWxzID0gb3JpZ2luYWw7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHByb3BzLnBhcnRpYWxzW29wdGlvbnMuYXJnc1swXV0gPSBvcHRpb25zLmZuO1xuXG4gICAgcmV0dXJuIHJldDtcbiAgfSk7XG59XG4iLCJcbmNvbnN0IGVycm9yUHJvcHMgPSBbJ2Rlc2NyaXB0aW9uJywgJ2ZpbGVOYW1lJywgJ2xpbmVOdW1iZXInLCAnbWVzc2FnZScsICduYW1lJywgJ251bWJlcicsICdzdGFjayddO1xuXG5mdW5jdGlvbiBFeGNlcHRpb24obWVzc2FnZSwgbm9kZSkge1xuICBsZXQgbG9jID0gbm9kZSAmJiBub2RlLmxvYyxcbiAgICAgIGxpbmUsXG4gICAgICBjb2x1bW47XG4gIGlmIChsb2MpIHtcbiAgICBsaW5lID0gbG9jLnN0YXJ0LmxpbmU7XG4gICAgY29sdW1uID0gbG9jLnN0YXJ0LmNvbHVtbjtcblxuICAgIG1lc3NhZ2UgKz0gJyAtICcgKyBsaW5lICsgJzonICsgY29sdW1uO1xuICB9XG5cbiAgbGV0IHRtcCA9IEVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIG1lc3NhZ2UpO1xuXG4gIC8vIFVuZm9ydHVuYXRlbHkgZXJyb3JzIGFyZSBub3QgZW51bWVyYWJsZSBpbiBDaHJvbWUgKGF0IGxlYXN0KSwgc28gYGZvciBwcm9wIGluIHRtcGAgZG9lc24ndCB3b3JrLlxuICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBlcnJvclByb3BzLmxlbmd0aDsgaWR4KyspIHtcbiAgICB0aGlzW2Vycm9yUHJvcHNbaWR4XV0gPSB0bXBbZXJyb3JQcm9wc1tpZHhdXTtcbiAgfVxuXG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICovXG4gIGlmIChFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIEV4Y2VwdGlvbik7XG4gIH1cblxuICBpZiAobG9jKSB7XG4gICAgdGhpcy5saW5lTnVtYmVyID0gbGluZTtcbiAgICB0aGlzLmNvbHVtbiA9IGNvbHVtbjtcbiAgfVxufVxuXG5FeGNlcHRpb24ucHJvdG90eXBlID0gbmV3IEVycm9yKCk7XG5cbmV4cG9ydCBkZWZhdWx0IEV4Y2VwdGlvbjtcbiIsImltcG9ydCByZWdpc3RlckJsb2NrSGVscGVyTWlzc2luZyBmcm9tICcuL2hlbHBlcnMvYmxvY2staGVscGVyLW1pc3NpbmcnO1xuaW1wb3J0IHJlZ2lzdGVyRWFjaCBmcm9tICcuL2hlbHBlcnMvZWFjaCc7XG5pbXBvcnQgcmVnaXN0ZXJIZWxwZXJNaXNzaW5nIGZyb20gJy4vaGVscGVycy9oZWxwZXItbWlzc2luZyc7XG5pbXBvcnQgcmVnaXN0ZXJJZiBmcm9tICcuL2hlbHBlcnMvaWYnO1xuaW1wb3J0IHJlZ2lzdGVyTG9nIGZyb20gJy4vaGVscGVycy9sb2cnO1xuaW1wb3J0IHJlZ2lzdGVyTG9va3VwIGZyb20gJy4vaGVscGVycy9sb29rdXAnO1xuaW1wb3J0IHJlZ2lzdGVyV2l0aCBmcm9tICcuL2hlbHBlcnMvd2l0aCc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRlZmF1bHRIZWxwZXJzKGluc3RhbmNlKSB7XG4gIHJlZ2lzdGVyQmxvY2tIZWxwZXJNaXNzaW5nKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJFYWNoKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJIZWxwZXJNaXNzaW5nKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJJZihpbnN0YW5jZSk7XG4gIHJlZ2lzdGVyTG9nKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJMb29rdXAoaW5zdGFuY2UpO1xuICByZWdpc3RlcldpdGgoaW5zdGFuY2UpO1xufVxuIiwiaW1wb3J0IHthcHBlbmRDb250ZXh0UGF0aCwgY3JlYXRlRnJhbWUsIGlzQXJyYXl9IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2Jsb2NrSGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBsZXQgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZSxcbiAgICAgICAgZm4gPSBvcHRpb25zLmZuO1xuXG4gICAgaWYgKGNvbnRleHQgPT09IHRydWUpIHtcbiAgICAgIHJldHVybiBmbih0aGlzKTtcbiAgICB9IGVsc2UgaWYgKGNvbnRleHQgPT09IGZhbHNlIHx8IGNvbnRleHQgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KGNvbnRleHQpKSB7XG4gICAgICBpZiAoY29udGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChvcHRpb25zLmlkcykge1xuICAgICAgICAgIG9wdGlvbnMuaWRzID0gW29wdGlvbnMubmFtZV07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW5zdGFuY2UuaGVscGVycy5lYWNoKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5pZHMpIHtcbiAgICAgICAgbGV0IGRhdGEgPSBjcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICAgICAgICBkYXRhLmNvbnRleHRQYXRoID0gYXBwZW5kQ29udGV4dFBhdGgob3B0aW9ucy5kYXRhLmNvbnRleHRQYXRoLCBvcHRpb25zLm5hbWUpO1xuICAgICAgICBvcHRpb25zID0ge2RhdGE6IGRhdGF9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZm4oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfVxuICB9KTtcbn1cbiIsImltcG9ydCB7YXBwZW5kQ29udGV4dFBhdGgsIGJsb2NrUGFyYW1zLCBjcmVhdGVGcmFtZSwgaXNBcnJheSwgaXNGdW5jdGlvbn0gZnJvbSAnLi4vdXRpbHMnO1xuaW1wb3J0IEV4Y2VwdGlvbiBmcm9tICcuLi9leGNlcHRpb24nO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignZWFjaCcsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ011c3QgcGFzcyBpdGVyYXRvciB0byAjZWFjaCcpO1xuICAgIH1cblxuICAgIGxldCBmbiA9IG9wdGlvbnMuZm4sXG4gICAgICAgIGludmVyc2UgPSBvcHRpb25zLmludmVyc2UsXG4gICAgICAgIGkgPSAwLFxuICAgICAgICByZXQgPSAnJyxcbiAgICAgICAgZGF0YSxcbiAgICAgICAgY29udGV4dFBhdGg7XG5cbiAgICBpZiAob3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuaWRzKSB7XG4gICAgICBjb250ZXh0UGF0aCA9IGFwcGVuZENvbnRleHRQYXRoKG9wdGlvbnMuZGF0YS5jb250ZXh0UGF0aCwgb3B0aW9ucy5pZHNbMF0pICsgJy4nO1xuICAgIH1cblxuICAgIGlmIChpc0Z1bmN0aW9uKGNvbnRleHQpKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICAgIGlmIChvcHRpb25zLmRhdGEpIHtcbiAgICAgIGRhdGEgPSBjcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4ZWNJdGVyYXRpb24oZmllbGQsIGluZGV4LCBsYXN0KSB7XG4gICAgICBpZiAoZGF0YSkge1xuICAgICAgICBkYXRhLmtleSA9IGZpZWxkO1xuICAgICAgICBkYXRhLmluZGV4ID0gaW5kZXg7XG4gICAgICAgIGRhdGEuZmlyc3QgPSBpbmRleCA9PT0gMDtcbiAgICAgICAgZGF0YS5sYXN0ID0gISFsYXN0O1xuXG4gICAgICAgIGlmIChjb250ZXh0UGF0aCkge1xuICAgICAgICAgIGRhdGEuY29udGV4dFBhdGggPSBjb250ZXh0UGF0aCArIGZpZWxkO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldCA9IHJldCArIGZuKGNvbnRleHRbZmllbGRdLCB7XG4gICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgIGJsb2NrUGFyYW1zOiBibG9ja1BhcmFtcyhbY29udGV4dFtmaWVsZF0sIGZpZWxkXSwgW2NvbnRleHRQYXRoICsgZmllbGQsIG51bGxdKVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoaXNBcnJheShjb250ZXh0KSkge1xuICAgICAgICBmb3IgKGxldCBqID0gY29udGV4dC5sZW5ndGg7IGkgPCBqOyBpKyspIHtcbiAgICAgICAgICBpZiAoaSBpbiBjb250ZXh0KSB7XG4gICAgICAgICAgICBleGVjSXRlcmF0aW9uKGksIGksIGkgPT09IGNvbnRleHQubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZXQgcHJpb3JLZXk7XG5cbiAgICAgICAgZm9yIChsZXQga2V5IGluIGNvbnRleHQpIHtcbiAgICAgICAgICBpZiAoY29udGV4dC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBydW5uaW5nIHRoZSBpdGVyYXRpb25zIG9uZSBzdGVwIG91dCBvZiBzeW5jIHNvIHdlIGNhbiBkZXRlY3RcbiAgICAgICAgICAgIC8vIHRoZSBsYXN0IGl0ZXJhdGlvbiB3aXRob3V0IGhhdmUgdG8gc2NhbiB0aGUgb2JqZWN0IHR3aWNlIGFuZCBjcmVhdGVcbiAgICAgICAgICAgIC8vIGFuIGl0ZXJtZWRpYXRlIGtleXMgYXJyYXkuXG4gICAgICAgICAgICBpZiAocHJpb3JLZXkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICBleGVjSXRlcmF0aW9uKHByaW9yS2V5LCBpIC0gMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcmlvcktleSA9IGtleTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHByaW9yS2V5ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBleGVjSXRlcmF0aW9uKHByaW9yS2V5LCBpIC0gMSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgcmV0ID0gaW52ZXJzZSh0aGlzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmV0O1xuICB9KTtcbn1cbiIsImltcG9ydCBFeGNlcHRpb24gZnJvbSAnLi4vZXhjZXB0aW9uJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbigvKiBbYXJncywgXW9wdGlvbnMgKi8pIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgLy8gQSBtaXNzaW5nIGZpZWxkIGluIGEge3tmb299fSBjb25zdHJ1Y3QuXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTb21lb25lIGlzIGFjdHVhbGx5IHRyeWluZyB0byBjYWxsIHNvbWV0aGluZywgYmxvdyB1cC5cbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ01pc3NpbmcgaGVscGVyOiBcIicgKyBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdLm5hbWUgKyAnXCInKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiaW1wb3J0IHtpc0VtcHR5LCBpc0Z1bmN0aW9ufSBmcm9tICcuLi91dGlscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdpZicsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oY29uZGl0aW9uYWwpKSB7IGNvbmRpdGlvbmFsID0gY29uZGl0aW9uYWwuY2FsbCh0aGlzKTsgfVxuXG4gICAgLy8gRGVmYXVsdCBiZWhhdmlvciBpcyB0byByZW5kZXIgdGhlIHBvc2l0aXZlIHBhdGggaWYgdGhlIHZhbHVlIGlzIHRydXRoeSBhbmQgbm90IGVtcHR5LlxuICAgIC8vIFRoZSBgaW5jbHVkZVplcm9gIG9wdGlvbiBtYXkgYmUgc2V0IHRvIHRyZWF0IHRoZSBjb25kdGlvbmFsIGFzIHB1cmVseSBub3QgZW1wdHkgYmFzZWQgb24gdGhlXG4gICAgLy8gYmVoYXZpb3Igb2YgaXNFbXB0eS4gRWZmZWN0aXZlbHkgdGhpcyBkZXRlcm1pbmVzIGlmIDAgaXMgaGFuZGxlZCBieSB0aGUgcG9zaXRpdmUgcGF0aCBvciBuZWdhdGl2ZS5cbiAgICBpZiAoKCFvcHRpb25zLmhhc2guaW5jbHVkZVplcm8gJiYgIWNvbmRpdGlvbmFsKSB8fCBpc0VtcHR5KGNvbmRpdGlvbmFsKSkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuZm4odGhpcyk7XG4gICAgfVxuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcigndW5sZXNzJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuaGVscGVyc1snaWYnXS5jYWxsKHRoaXMsIGNvbmRpdGlvbmFsLCB7Zm46IG9wdGlvbnMuaW52ZXJzZSwgaW52ZXJzZTogb3B0aW9ucy5mbiwgaGFzaDogb3B0aW9ucy5oYXNofSk7XG4gIH0pO1xufVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2xvZycsIGZ1bmN0aW9uKC8qIG1lc3NhZ2UsIG9wdGlvbnMgKi8pIHtcbiAgICBsZXQgYXJncyA9IFt1bmRlZmluZWRdLFxuICAgICAgICBvcHRpb25zID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGFyZ3MucHVzaChhcmd1bWVudHNbaV0pO1xuICAgIH1cblxuICAgIGxldCBsZXZlbCA9IDE7XG4gICAgaWYgKG9wdGlvbnMuaGFzaC5sZXZlbCAhPSBudWxsKSB7XG4gICAgICBsZXZlbCA9IG9wdGlvbnMuaGFzaC5sZXZlbDtcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLmRhdGEubGV2ZWwgIT0gbnVsbCkge1xuICAgICAgbGV2ZWwgPSBvcHRpb25zLmRhdGEubGV2ZWw7XG4gICAgfVxuICAgIGFyZ3NbMF0gPSBsZXZlbDtcblxuICAgIGluc3RhbmNlLmxvZyguLi4gYXJncyk7XG4gIH0pO1xufVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2xvb2t1cCcsIGZ1bmN0aW9uKG9iaiwgZmllbGQpIHtcbiAgICByZXR1cm4gb2JqICYmIG9ialtmaWVsZF07XG4gIH0pO1xufVxuIiwiaW1wb3J0IHthcHBlbmRDb250ZXh0UGF0aCwgYmxvY2tQYXJhbXMsIGNyZWF0ZUZyYW1lLCBpc0VtcHR5LCBpc0Z1bmN0aW9ufSBmcm9tICcuLi91dGlscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCd3aXRoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIGlmIChpc0Z1bmN0aW9uKGNvbnRleHQpKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICAgIGxldCBmbiA9IG9wdGlvbnMuZm47XG5cbiAgICBpZiAoIWlzRW1wdHkoY29udGV4dCkpIHtcbiAgICAgIGxldCBkYXRhID0gb3B0aW9ucy5kYXRhO1xuICAgICAgaWYgKG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLmlkcykge1xuICAgICAgICBkYXRhID0gY3JlYXRlRnJhbWUob3B0aW9ucy5kYXRhKTtcbiAgICAgICAgZGF0YS5jb250ZXh0UGF0aCA9IGFwcGVuZENvbnRleHRQYXRoKG9wdGlvbnMuZGF0YS5jb250ZXh0UGF0aCwgb3B0aW9ucy5pZHNbMF0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZm4oY29udGV4dCwge1xuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICBibG9ja1BhcmFtczogYmxvY2tQYXJhbXMoW2NvbnRleHRdLCBbZGF0YSAmJiBkYXRhLmNvbnRleHRQYXRoXSlcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb3B0aW9ucy5pbnZlcnNlKHRoaXMpO1xuICAgIH1cbiAgfSk7XG59XG4iLCJpbXBvcnQge2luZGV4T2Z9IGZyb20gJy4vdXRpbHMnO1xuXG5sZXQgbG9nZ2VyID0ge1xuICBtZXRob2RNYXA6IFsnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ10sXG4gIGxldmVsOiAnaW5mbycsXG5cbiAgLy8gTWFwcyBhIGdpdmVuIGxldmVsIHZhbHVlIHRvIHRoZSBgbWV0aG9kTWFwYCBpbmRleGVzIGFib3ZlLlxuICBsb29rdXBMZXZlbDogZnVuY3Rpb24obGV2ZWwpIHtcbiAgICBpZiAodHlwZW9mIGxldmVsID09PSAnc3RyaW5nJykge1xuICAgICAgbGV0IGxldmVsTWFwID0gaW5kZXhPZihsb2dnZXIubWV0aG9kTWFwLCBsZXZlbC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgIGlmIChsZXZlbE1hcCA+PSAwKSB7XG4gICAgICAgIGxldmVsID0gbGV2ZWxNYXA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZXZlbCA9IHBhcnNlSW50KGxldmVsLCAxMCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGxldmVsO1xuICB9LFxuXG4gIC8vIENhbiBiZSBvdmVycmlkZGVuIGluIHRoZSBob3N0IGVudmlyb25tZW50XG4gIGxvZzogZnVuY3Rpb24obGV2ZWwsIC4uLm1lc3NhZ2UpIHtcbiAgICBsZXZlbCA9IGxvZ2dlci5sb29rdXBMZXZlbChsZXZlbCk7XG5cbiAgICBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGxvZ2dlci5sb29rdXBMZXZlbChsb2dnZXIubGV2ZWwpIDw9IGxldmVsKSB7XG4gICAgICBsZXQgbWV0aG9kID0gbG9nZ2VyLm1ldGhvZE1hcFtsZXZlbF07XG4gICAgICBpZiAoIWNvbnNvbGVbbWV0aG9kXSkgeyAgIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tY29uc29sZVxuICAgICAgICBtZXRob2QgPSAnbG9nJztcbiAgICAgIH1cbiAgICAgIGNvbnNvbGVbbWV0aG9kXSguLi5tZXNzYWdlKTsgICAgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby1jb25zb2xlXG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBsb2dnZXI7XG4iLCIvKiBnbG9iYWwgd2luZG93ICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihIYW5kbGViYXJzKSB7XG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gIGxldCByb290ID0gdHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcgPyBnbG9iYWwgOiB3aW5kb3csXG4gICAgICAkSGFuZGxlYmFycyA9IHJvb3QuSGFuZGxlYmFycztcbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgSGFuZGxlYmFycy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHJvb3QuSGFuZGxlYmFycyA9PT0gSGFuZGxlYmFycykge1xuICAgICAgcm9vdC5IYW5kbGViYXJzID0gJEhhbmRsZWJhcnM7XG4gICAgfVxuICAgIHJldHVybiBIYW5kbGViYXJzO1xuICB9O1xufVxuIiwiaW1wb3J0ICogYXMgVXRpbHMgZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgRXhjZXB0aW9uIGZyb20gJy4vZXhjZXB0aW9uJztcbmltcG9ydCB7IENPTVBJTEVSX1JFVklTSU9OLCBSRVZJU0lPTl9DSEFOR0VTLCBjcmVhdGVGcmFtZSB9IGZyb20gJy4vYmFzZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjaGVja1JldmlzaW9uKGNvbXBpbGVySW5mbykge1xuICBjb25zdCBjb21waWxlclJldmlzaW9uID0gY29tcGlsZXJJbmZvICYmIGNvbXBpbGVySW5mb1swXSB8fCAxLFxuICAgICAgICBjdXJyZW50UmV2aXNpb24gPSBDT01QSUxFUl9SRVZJU0lPTjtcblxuICBpZiAoY29tcGlsZXJSZXZpc2lvbiAhPT0gY3VycmVudFJldmlzaW9uKSB7XG4gICAgaWYgKGNvbXBpbGVyUmV2aXNpb24gPCBjdXJyZW50UmV2aXNpb24pIHtcbiAgICAgIGNvbnN0IHJ1bnRpbWVWZXJzaW9ucyA9IFJFVklTSU9OX0NIQU5HRVNbY3VycmVudFJldmlzaW9uXSxcbiAgICAgICAgICAgIGNvbXBpbGVyVmVyc2lvbnMgPSBSRVZJU0lPTl9DSEFOR0VTW2NvbXBpbGVyUmV2aXNpb25dO1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYW4gb2xkZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gJyArXG4gICAgICAgICAgICAnUGxlYXNlIHVwZGF0ZSB5b3VyIHByZWNvbXBpbGVyIHRvIGEgbmV3ZXIgdmVyc2lvbiAoJyArIHJ1bnRpbWVWZXJzaW9ucyArICcpIG9yIGRvd25ncmFkZSB5b3VyIHJ1bnRpbWUgdG8gYW4gb2xkZXIgdmVyc2lvbiAoJyArIGNvbXBpbGVyVmVyc2lvbnMgKyAnKS4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIHRoZSBlbWJlZGRlZCB2ZXJzaW9uIGluZm8gc2luY2UgdGhlIHJ1bnRpbWUgZG9lc24ndCBrbm93IGFib3V0IHRoaXMgcmV2aXNpb24geWV0XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhIG5ld2VyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuICcgK1xuICAgICAgICAgICAgJ1BsZWFzZSB1cGRhdGUgeW91ciBydW50aW1lIHRvIGEgbmV3ZXIgdmVyc2lvbiAoJyArIGNvbXBpbGVySW5mb1sxXSArICcpLicpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGVtcGxhdGUodGVtcGxhdGVTcGVjLCBlbnYpIHtcbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgaWYgKCFlbnYpIHtcbiAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdObyBlbnZpcm9ubWVudCBwYXNzZWQgdG8gdGVtcGxhdGUnKTtcbiAgfVxuICBpZiAoIXRlbXBsYXRlU3BlYyB8fCAhdGVtcGxhdGVTcGVjLm1haW4pIHtcbiAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdVbmtub3duIHRlbXBsYXRlIG9iamVjdDogJyArIHR5cGVvZiB0ZW1wbGF0ZVNwZWMpO1xuICB9XG5cbiAgdGVtcGxhdGVTcGVjLm1haW4uZGVjb3JhdG9yID0gdGVtcGxhdGVTcGVjLm1haW5fZDtcblxuICAvLyBOb3RlOiBVc2luZyBlbnYuVk0gcmVmZXJlbmNlcyByYXRoZXIgdGhhbiBsb2NhbCB2YXIgcmVmZXJlbmNlcyB0aHJvdWdob3V0IHRoaXMgc2VjdGlvbiB0byBhbGxvd1xuICAvLyBmb3IgZXh0ZXJuYWwgdXNlcnMgdG8gb3ZlcnJpZGUgdGhlc2UgYXMgcHN1ZWRvLXN1cHBvcnRlZCBBUElzLlxuICBlbnYuVk0uY2hlY2tSZXZpc2lvbih0ZW1wbGF0ZVNwZWMuY29tcGlsZXIpO1xuXG4gIGZ1bmN0aW9uIGludm9rZVBhcnRpYWxXcmFwcGVyKHBhcnRpYWwsIGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5oYXNoKSB7XG4gICAgICBjb250ZXh0ID0gVXRpbHMuZXh0ZW5kKHt9LCBjb250ZXh0LCBvcHRpb25zLmhhc2gpO1xuICAgICAgaWYgKG9wdGlvbnMuaWRzKSB7XG4gICAgICAgIG9wdGlvbnMuaWRzWzBdID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBwYXJ0aWFsID0gZW52LlZNLnJlc29sdmVQYXJ0aWFsLmNhbGwodGhpcywgcGFydGlhbCwgY29udGV4dCwgb3B0aW9ucyk7XG4gICAgbGV0IHJlc3VsdCA9IGVudi5WTS5pbnZva2VQYXJ0aWFsLmNhbGwodGhpcywgcGFydGlhbCwgY29udGV4dCwgb3B0aW9ucyk7XG5cbiAgICBpZiAocmVzdWx0ID09IG51bGwgJiYgZW52LmNvbXBpbGUpIHtcbiAgICAgIG9wdGlvbnMucGFydGlhbHNbb3B0aW9ucy5uYW1lXSA9IGVudi5jb21waWxlKHBhcnRpYWwsIHRlbXBsYXRlU3BlYy5jb21waWxlck9wdGlvbnMsIGVudik7XG4gICAgICByZXN1bHQgPSBvcHRpb25zLnBhcnRpYWxzW29wdGlvbnMubmFtZV0oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGlmIChyZXN1bHQgIT0gbnVsbCkge1xuICAgICAgaWYgKG9wdGlvbnMuaW5kZW50KSB7XG4gICAgICAgIGxldCBsaW5lcyA9IHJlc3VsdC5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwLCBsID0gbGluZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgaWYgKCFsaW5lc1tpXSAmJiBpICsgMSA9PT0gbCkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGluZXNbaV0gPSBvcHRpb25zLmluZGVudCArIGxpbmVzW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignVGhlIHBhcnRpYWwgJyArIG9wdGlvbnMubmFtZSArICcgY291bGQgbm90IGJlIGNvbXBpbGVkIHdoZW4gcnVubmluZyBpbiBydW50aW1lLW9ubHkgbW9kZScpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEp1c3QgYWRkIHdhdGVyXG4gIGxldCBjb250YWluZXIgPSB7XG4gICAgc3RyaWN0OiBmdW5jdGlvbihvYmosIG5hbWUpIHtcbiAgICAgIGlmICghKG5hbWUgaW4gb2JqKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdcIicgKyBuYW1lICsgJ1wiIG5vdCBkZWZpbmVkIGluICcgKyBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9ialtuYW1lXTtcbiAgICB9LFxuICAgIGxvb2t1cDogZnVuY3Rpb24oZGVwdGhzLCBuYW1lKSB7XG4gICAgICBjb25zdCBsZW4gPSBkZXB0aHMubGVuZ3RoO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBpZiAoZGVwdGhzW2ldICYmIGRlcHRoc1tpXVtuYW1lXSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIGRlcHRoc1tpXVtuYW1lXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgbGFtYmRhOiBmdW5jdGlvbihjdXJyZW50LCBjb250ZXh0KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIGN1cnJlbnQgPT09ICdmdW5jdGlvbicgPyBjdXJyZW50LmNhbGwoY29udGV4dCkgOiBjdXJyZW50O1xuICAgIH0sXG5cbiAgICBlc2NhcGVFeHByZXNzaW9uOiBVdGlscy5lc2NhcGVFeHByZXNzaW9uLFxuICAgIGludm9rZVBhcnRpYWw6IGludm9rZVBhcnRpYWxXcmFwcGVyLFxuXG4gICAgZm46IGZ1bmN0aW9uKGkpIHtcbiAgICAgIGxldCByZXQgPSB0ZW1wbGF0ZVNwZWNbaV07XG4gICAgICByZXQuZGVjb3JhdG9yID0gdGVtcGxhdGVTcGVjW2kgKyAnX2QnXTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfSxcblxuICAgIHByb2dyYW1zOiBbXSxcbiAgICBwcm9ncmFtOiBmdW5jdGlvbihpLCBkYXRhLCBkZWNsYXJlZEJsb2NrUGFyYW1zLCBibG9ja1BhcmFtcywgZGVwdGhzKSB7XG4gICAgICBsZXQgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldLFxuICAgICAgICAgIGZuID0gdGhpcy5mbihpKTtcbiAgICAgIGlmIChkYXRhIHx8IGRlcHRocyB8fCBibG9ja1BhcmFtcyB8fCBkZWNsYXJlZEJsb2NrUGFyYW1zKSB7XG4gICAgICAgIHByb2dyYW1XcmFwcGVyID0gd3JhcFByb2dyYW0odGhpcywgaSwgZm4sIGRhdGEsIGRlY2xhcmVkQmxvY2tQYXJhbXMsIGJsb2NrUGFyYW1zLCBkZXB0aHMpO1xuICAgICAgfSBlbHNlIGlmICghcHJvZ3JhbVdyYXBwZXIpIHtcbiAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldID0gd3JhcFByb2dyYW0odGhpcywgaSwgZm4pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1XcmFwcGVyO1xuICAgIH0sXG5cbiAgICBkYXRhOiBmdW5jdGlvbih2YWx1ZSwgZGVwdGgpIHtcbiAgICAgIHdoaWxlICh2YWx1ZSAmJiBkZXB0aC0tKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUuX3BhcmVudDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9LFxuICAgIG1lcmdlOiBmdW5jdGlvbihwYXJhbSwgY29tbW9uKSB7XG4gICAgICBsZXQgb2JqID0gcGFyYW0gfHwgY29tbW9uO1xuXG4gICAgICBpZiAocGFyYW0gJiYgY29tbW9uICYmIChwYXJhbSAhPT0gY29tbW9uKSkge1xuICAgICAgICBvYmogPSBVdGlscy5leHRlbmQoe30sIGNvbW1vbiwgcGFyYW0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gb2JqO1xuICAgIH0sXG5cbiAgICBub29wOiBlbnYuVk0ubm9vcCxcbiAgICBjb21waWxlckluZm86IHRlbXBsYXRlU3BlYy5jb21waWxlclxuICB9O1xuXG4gIGZ1bmN0aW9uIHJldChjb250ZXh0LCBvcHRpb25zID0ge30pIHtcbiAgICBsZXQgZGF0YSA9IG9wdGlvbnMuZGF0YTtcblxuICAgIHJldC5fc2V0dXAob3B0aW9ucyk7XG4gICAgaWYgKCFvcHRpb25zLnBhcnRpYWwgJiYgdGVtcGxhdGVTcGVjLnVzZURhdGEpIHtcbiAgICAgIGRhdGEgPSBpbml0RGF0YShjb250ZXh0LCBkYXRhKTtcbiAgICB9XG4gICAgbGV0IGRlcHRocyxcbiAgICAgICAgYmxvY2tQYXJhbXMgPSB0ZW1wbGF0ZVNwZWMudXNlQmxvY2tQYXJhbXMgPyBbXSA6IHVuZGVmaW5lZDtcbiAgICBpZiAodGVtcGxhdGVTcGVjLnVzZURlcHRocykge1xuICAgICAgaWYgKG9wdGlvbnMuZGVwdGhzKSB7XG4gICAgICAgIGRlcHRocyA9IGNvbnRleHQgIT09IG9wdGlvbnMuZGVwdGhzWzBdID8gW2NvbnRleHRdLmNvbmNhdChvcHRpb25zLmRlcHRocykgOiBvcHRpb25zLmRlcHRocztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlcHRocyA9IFtjb250ZXh0XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYWluKGNvbnRleHQvKiwgb3B0aW9ucyovKSB7XG4gICAgICByZXR1cm4gJycgKyB0ZW1wbGF0ZVNwZWMubWFpbihjb250YWluZXIsIGNvbnRleHQsIGNvbnRhaW5lci5oZWxwZXJzLCBjb250YWluZXIucGFydGlhbHMsIGRhdGEsIGJsb2NrUGFyYW1zLCBkZXB0aHMpO1xuICAgIH1cbiAgICBtYWluID0gZXhlY3V0ZURlY29yYXRvcnModGVtcGxhdGVTcGVjLm1haW4sIG1haW4sIGNvbnRhaW5lciwgb3B0aW9ucy5kZXB0aHMgfHwgW10sIGRhdGEsIGJsb2NrUGFyYW1zKTtcbiAgICByZXR1cm4gbWFpbihjb250ZXh0LCBvcHRpb25zKTtcbiAgfVxuICByZXQuaXNUb3AgPSB0cnVlO1xuXG4gIHJldC5fc2V0dXAgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zLnBhcnRpYWwpIHtcbiAgICAgIGNvbnRhaW5lci5oZWxwZXJzID0gY29udGFpbmVyLm1lcmdlKG9wdGlvbnMuaGVscGVycywgZW52LmhlbHBlcnMpO1xuXG4gICAgICBpZiAodGVtcGxhdGVTcGVjLnVzZVBhcnRpYWwpIHtcbiAgICAgICAgY29udGFpbmVyLnBhcnRpYWxzID0gY29udGFpbmVyLm1lcmdlKG9wdGlvbnMucGFydGlhbHMsIGVudi5wYXJ0aWFscyk7XG4gICAgICB9XG4gICAgICBpZiAodGVtcGxhdGVTcGVjLnVzZVBhcnRpYWwgfHwgdGVtcGxhdGVTcGVjLnVzZURlY29yYXRvcnMpIHtcbiAgICAgICAgY29udGFpbmVyLmRlY29yYXRvcnMgPSBjb250YWluZXIubWVyZ2Uob3B0aW9ucy5kZWNvcmF0b3JzLCBlbnYuZGVjb3JhdG9ycyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lci5oZWxwZXJzID0gb3B0aW9ucy5oZWxwZXJzO1xuICAgICAgY29udGFpbmVyLnBhcnRpYWxzID0gb3B0aW9ucy5wYXJ0aWFscztcbiAgICAgIGNvbnRhaW5lci5kZWNvcmF0b3JzID0gb3B0aW9ucy5kZWNvcmF0b3JzO1xuICAgIH1cbiAgfTtcblxuICByZXQuX2NoaWxkID0gZnVuY3Rpb24oaSwgZGF0YSwgYmxvY2tQYXJhbXMsIGRlcHRocykge1xuICAgIGlmICh0ZW1wbGF0ZVNwZWMudXNlQmxvY2tQYXJhbXMgJiYgIWJsb2NrUGFyYW1zKSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdtdXN0IHBhc3MgYmxvY2sgcGFyYW1zJyk7XG4gICAgfVxuICAgIGlmICh0ZW1wbGF0ZVNwZWMudXNlRGVwdGhzICYmICFkZXB0aHMpIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ211c3QgcGFzcyBwYXJlbnQgZGVwdGhzJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHdyYXBQcm9ncmFtKGNvbnRhaW5lciwgaSwgdGVtcGxhdGVTcGVjW2ldLCBkYXRhLCAwLCBibG9ja1BhcmFtcywgZGVwdGhzKTtcbiAgfTtcbiAgcmV0dXJuIHJldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyYXBQcm9ncmFtKGNvbnRhaW5lciwgaSwgZm4sIGRhdGEsIGRlY2xhcmVkQmxvY2tQYXJhbXMsIGJsb2NrUGFyYW1zLCBkZXB0aHMpIHtcbiAgZnVuY3Rpb24gcHJvZyhjb250ZXh0LCBvcHRpb25zID0ge30pIHtcbiAgICBsZXQgY3VycmVudERlcHRocyA9IGRlcHRocztcbiAgICBpZiAoZGVwdGhzICYmIGNvbnRleHQgIT09IGRlcHRoc1swXSkge1xuICAgICAgY3VycmVudERlcHRocyA9IFtjb250ZXh0XS5jb25jYXQoZGVwdGhzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZm4oY29udGFpbmVyLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBjb250YWluZXIuaGVscGVycywgY29udGFpbmVyLnBhcnRpYWxzLFxuICAgICAgICBvcHRpb25zLmRhdGEgfHwgZGF0YSxcbiAgICAgICAgYmxvY2tQYXJhbXMgJiYgW29wdGlvbnMuYmxvY2tQYXJhbXNdLmNvbmNhdChibG9ja1BhcmFtcyksXG4gICAgICAgIGN1cnJlbnREZXB0aHMpO1xuICB9XG5cbiAgcHJvZyA9IGV4ZWN1dGVEZWNvcmF0b3JzKGZuLCBwcm9nLCBjb250YWluZXIsIGRlcHRocywgZGF0YSwgYmxvY2tQYXJhbXMpO1xuXG4gIHByb2cucHJvZ3JhbSA9IGk7XG4gIHByb2cuZGVwdGggPSBkZXB0aHMgPyBkZXB0aHMubGVuZ3RoIDogMDtcbiAgcHJvZy5ibG9ja1BhcmFtcyA9IGRlY2xhcmVkQmxvY2tQYXJhbXMgfHwgMDtcbiAgcmV0dXJuIHByb2c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUGFydGlhbChwYXJ0aWFsLCBjb250ZXh0LCBvcHRpb25zKSB7XG4gIGlmICghcGFydGlhbCkge1xuICAgIGlmIChvcHRpb25zLm5hbWUgPT09ICdAcGFydGlhbC1ibG9jaycpIHtcbiAgICAgIHBhcnRpYWwgPSBvcHRpb25zLmRhdGFbJ3BhcnRpYWwtYmxvY2snXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGFydGlhbCA9IG9wdGlvbnMucGFydGlhbHNbb3B0aW9ucy5uYW1lXTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIXBhcnRpYWwuY2FsbCAmJiAhb3B0aW9ucy5uYW1lKSB7XG4gICAgLy8gVGhpcyBpcyBhIGR5bmFtaWMgcGFydGlhbCB0aGF0IHJldHVybmVkIGEgc3RyaW5nXG4gICAgb3B0aW9ucy5uYW1lID0gcGFydGlhbDtcbiAgICBwYXJ0aWFsID0gb3B0aW9ucy5wYXJ0aWFsc1twYXJ0aWFsXTtcbiAgfVxuICByZXR1cm4gcGFydGlhbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludm9rZVBhcnRpYWwocGFydGlhbCwgY29udGV4dCwgb3B0aW9ucykge1xuICBvcHRpb25zLnBhcnRpYWwgPSB0cnVlO1xuICBpZiAob3B0aW9ucy5pZHMpIHtcbiAgICBvcHRpb25zLmRhdGEuY29udGV4dFBhdGggPSBvcHRpb25zLmlkc1swXSB8fCBvcHRpb25zLmRhdGEuY29udGV4dFBhdGg7XG4gIH1cblxuICBsZXQgcGFydGlhbEJsb2NrO1xuICBpZiAob3B0aW9ucy5mbiAmJiBvcHRpb25zLmZuICE9PSBub29wKSB7XG4gICAgb3B0aW9ucy5kYXRhID0gY3JlYXRlRnJhbWUob3B0aW9ucy5kYXRhKTtcbiAgICBwYXJ0aWFsQmxvY2sgPSBvcHRpb25zLmRhdGFbJ3BhcnRpYWwtYmxvY2snXSA9IG9wdGlvbnMuZm47XG5cbiAgICBpZiAocGFydGlhbEJsb2NrLnBhcnRpYWxzKSB7XG4gICAgICBvcHRpb25zLnBhcnRpYWxzID0gVXRpbHMuZXh0ZW5kKHt9LCBvcHRpb25zLnBhcnRpYWxzLCBwYXJ0aWFsQmxvY2sucGFydGlhbHMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYXJ0aWFsID09PSB1bmRlZmluZWQgJiYgcGFydGlhbEJsb2NrKSB7XG4gICAgcGFydGlhbCA9IHBhcnRpYWxCbG9jaztcbiAgfVxuXG4gIGlmIChwYXJ0aWFsID09PSB1bmRlZmluZWQpIHtcbiAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdUaGUgcGFydGlhbCAnICsgb3B0aW9ucy5uYW1lICsgJyBjb3VsZCBub3QgYmUgZm91bmQnKTtcbiAgfSBlbHNlIGlmIChwYXJ0aWFsIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICByZXR1cm4gcGFydGlhbChjb250ZXh0LCBvcHRpb25zKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9vcCgpIHsgcmV0dXJuICcnOyB9XG5cbmZ1bmN0aW9uIGluaXREYXRhKGNvbnRleHQsIGRhdGEpIHtcbiAgaWYgKCFkYXRhIHx8ICEoJ3Jvb3QnIGluIGRhdGEpKSB7XG4gICAgZGF0YSA9IGRhdGEgPyBjcmVhdGVGcmFtZShkYXRhKSA6IHt9O1xuICAgIGRhdGEucm9vdCA9IGNvbnRleHQ7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGVEZWNvcmF0b3JzKGZuLCBwcm9nLCBjb250YWluZXIsIGRlcHRocywgZGF0YSwgYmxvY2tQYXJhbXMpIHtcbiAgaWYgKGZuLmRlY29yYXRvcikge1xuICAgIGxldCBwcm9wcyA9IHt9O1xuICAgIHByb2cgPSBmbi5kZWNvcmF0b3IocHJvZywgcHJvcHMsIGNvbnRhaW5lciwgZGVwdGhzICYmIGRlcHRoc1swXSwgZGF0YSwgYmxvY2tQYXJhbXMsIGRlcHRocyk7XG4gICAgVXRpbHMuZXh0ZW5kKHByb2csIHByb3BzKTtcbiAgfVxuICByZXR1cm4gcHJvZztcbn1cbiIsIi8vIEJ1aWxkIG91dCBvdXIgYmFzaWMgU2FmZVN0cmluZyB0eXBlXG5mdW5jdGlvbiBTYWZlU3RyaW5nKHN0cmluZykge1xuICB0aGlzLnN0cmluZyA9IHN0cmluZztcbn1cblxuU2FmZVN0cmluZy5wcm90b3R5cGUudG9TdHJpbmcgPSBTYWZlU3RyaW5nLnByb3RvdHlwZS50b0hUTUwgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICcnICsgdGhpcy5zdHJpbmc7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBTYWZlU3RyaW5nO1xuIiwiY29uc3QgZXNjYXBlID0ge1xuICAnJic6ICcmYW1wOycsXG4gICc8JzogJyZsdDsnLFxuICAnPic6ICcmZ3Q7JyxcbiAgJ1wiJzogJyZxdW90OycsXG4gIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgJ2AnOiAnJiN4NjA7JyxcbiAgJz0nOiAnJiN4M0Q7J1xufTtcblxuY29uc3QgYmFkQ2hhcnMgPSAvWyY8PlwiJ2A9XS9nLFxuICAgICAgcG9zc2libGUgPSAvWyY8PlwiJ2A9XS87XG5cbmZ1bmN0aW9uIGVzY2FwZUNoYXIoY2hyKSB7XG4gIHJldHVybiBlc2NhcGVbY2hyXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dGVuZChvYmovKiAsIC4uLnNvdXJjZSAqLykge1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IGtleSBpbiBhcmd1bWVudHNbaV0pIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYXJndW1lbnRzW2ldLCBrZXkpKSB7XG4gICAgICAgIG9ialtrZXldID0gYXJndW1lbnRzW2ldW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn1cblxuZXhwb3J0IGxldCB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8vIFNvdXJjZWQgZnJvbSBsb2Rhc2hcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXN0aWVqcy9sb2Rhc2gvYmxvYi9tYXN0ZXIvTElDRU5TRS50eHRcbi8qIGVzbGludC1kaXNhYmxlIGZ1bmMtc3R5bGUgKi9cbmxldCBpc0Z1bmN0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJztcbn07XG4vLyBmYWxsYmFjayBmb3Igb2xkZXIgdmVyc2lvbnMgb2YgQ2hyb21lIGFuZCBTYWZhcmlcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5pZiAoaXNGdW5jdGlvbigveC8pKSB7XG4gIGlzRnVuY3Rpb24gPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXSc7XG4gIH07XG59XG5leHBvcnQge2lzRnVuY3Rpb259O1xuLyogZXNsaW50LWVuYWJsZSBmdW5jLXN0eWxlICovXG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5leHBvcnQgY29uc3QgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSA/IHRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBBcnJheV0nIDogZmFsc2U7XG59O1xuXG4vLyBPbGRlciBJRSB2ZXJzaW9ucyBkbyBub3QgZGlyZWN0bHkgc3VwcG9ydCBpbmRleE9mIHNvIHdlIG11c3QgaW1wbGVtZW50IG91ciBvd24sIHNhZGx5LlxuZXhwb3J0IGZ1bmN0aW9uIGluZGV4T2YoYXJyYXksIHZhbHVlKSB7XG4gIGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIGlmIChhcnJheVtpXSA9PT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUV4cHJlc3Npb24oc3RyaW5nKSB7XG4gIGlmICh0eXBlb2Ygc3RyaW5nICE9PSAnc3RyaW5nJykge1xuICAgIC8vIGRvbid0IGVzY2FwZSBTYWZlU3RyaW5ncywgc2luY2UgdGhleSdyZSBhbHJlYWR5IHNhZmVcbiAgICBpZiAoc3RyaW5nICYmIHN0cmluZy50b0hUTUwpIHtcbiAgICAgIHJldHVybiBzdHJpbmcudG9IVE1MKCk7XG4gICAgfSBlbHNlIGlmIChzdHJpbmcgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH0gZWxzZSBpZiAoIXN0cmluZykge1xuICAgICAgcmV0dXJuIHN0cmluZyArICcnO1xuICAgIH1cblxuICAgIC8vIEZvcmNlIGEgc3RyaW5nIGNvbnZlcnNpb24gYXMgdGhpcyB3aWxsIGJlIGRvbmUgYnkgdGhlIGFwcGVuZCByZWdhcmRsZXNzIGFuZFxuICAgIC8vIHRoZSByZWdleCB0ZXN0IHdpbGwgZG8gdGhpcyB0cmFuc3BhcmVudGx5IGJlaGluZCB0aGUgc2NlbmVzLCBjYXVzaW5nIGlzc3VlcyBpZlxuICAgIC8vIGFuIG9iamVjdCdzIHRvIHN0cmluZyBoYXMgZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGl0LlxuICAgIHN0cmluZyA9ICcnICsgc3RyaW5nO1xuICB9XG5cbiAgaWYgKCFwb3NzaWJsZS50ZXN0KHN0cmluZykpIHsgcmV0dXJuIHN0cmluZzsgfVxuICByZXR1cm4gc3RyaW5nLnJlcGxhY2UoYmFkQ2hhcnMsIGVzY2FwZUNoYXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZSkge1xuICBpZiAoIXZhbHVlICYmIHZhbHVlICE9PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSBpZiAoaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGcmFtZShvYmplY3QpIHtcbiAgbGV0IGZyYW1lID0gZXh0ZW5kKHt9LCBvYmplY3QpO1xuICBmcmFtZS5fcGFyZW50ID0gb2JqZWN0O1xuICByZXR1cm4gZnJhbWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBibG9ja1BhcmFtcyhwYXJhbXMsIGlkcykge1xuICBwYXJhbXMucGF0aCA9IGlkcztcbiAgcmV0dXJuIHBhcmFtcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZENvbnRleHRQYXRoKGNvbnRleHRQYXRoLCBpZCkge1xuICByZXR1cm4gKGNvbnRleHRQYXRoID8gY29udGV4dFBhdGggKyAnLicgOiAnJykgKyBpZDtcbn1cbiIsIi8vIENyZWF0ZSBhIHNpbXBsZSBwYXRoIGFsaWFzIHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gcmVzb2x2ZVxuLy8gdGhlIHJ1bnRpbWUgb24gYSBzdXBwb3J0ZWQgcGF0aC5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kaXN0L2Nqcy9oYW5kbGViYXJzLnJ1bnRpbWUnKVsnZGVmYXVsdCddO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiaGFuZGxlYmFycy9ydW50aW1lXCIpW1wiZGVmYXVsdFwiXTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBoZWxwZXI7XG5cbiAgcmV0dXJuIFwiPGhlYWQ+XFxuICA8bWV0YSBjaGFyc2V0PVxcXCJ1dGYtOFxcXCI+XFxuICA8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9SW5jb25zb2xhdGFcXFwiPlxcbiAgPHN0eWxlIHR5cGU9XFxcInRleHQvY3NzXFxcIj5cIlxuICAgICsgKChzdGFjazEgPSAoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLmNzcyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuY3NzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGhlbHBlcnMuaGVscGVyTWlzc2luZyksKHR5cGVvZiBoZWxwZXIgPT09IFwiZnVuY3Rpb25cIiA/IGhlbHBlci5jYWxsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30se1wibmFtZVwiOlwiY3NzXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCI8L3N0eWxlPlxcbjwvaGVhZD5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiICAgICAgICAoXCJcbiAgICArIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuYW50ZSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIilcXG5cIjtcbn0sXCIzXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxLCBhbGlhczE9ZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fTtcblxuICByZXR1cm4gXCIgICAgICBcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDEgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDQsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMiA6IHN0YWNrMSkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oNiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuICAgICAgXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQzIDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSg4LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCJcXG4gICAgICBcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDQgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEwLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCJcXG4gICAgICBcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDUgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEyLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCJcXG5cIjtcbn0sXCI0XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiBcIlxuICAgICsgKChzdGFjazEgPSBjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQxIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCI2XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiBcIlxuICAgICsgKChzdGFjazEgPSBjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQyIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCI4XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiBcIlxuICAgICsgKChzdGFjazEgPSBjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQzIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCIxMFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZEJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkNCA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgXCI7XG59LFwiMTJcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiIFwiXG4gICAgKyAoKHN0YWNrMSA9IGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRCb2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDUgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiIFwiO1xufSxcIjE0XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIgICAgICAmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDtcXG5cIjtcbn0sXCIxNlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgaGVscGVyLCBvcHRpb25zLCBhbGlhczE9ZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwgYWxpYXMyPWhlbHBlcnMuaGVscGVyTWlzc2luZywgYWxpYXMzPVwiZnVuY3Rpb25cIiwgYWxpYXM0PWhlbHBlcnMuYmxvY2tIZWxwZXJNaXNzaW5nLCBidWZmZXIgPSBcbiAgXCIgICAgPHNwYW4gY2xhc3M9XFxcImhodi1kYXRlXFxcIj5cXG4gICAgICBcIjtcbiAgc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy50d29kaWdpdHMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR3b2RpZ2l0cyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLChvcHRpb25zPXtcIm5hbWVcIjpcInR3b2RpZ2l0c1wiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxNywgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEsb3B0aW9ucykgOiBoZWxwZXIpKTtcbiAgaWYgKCFoZWxwZXJzLnR3b2RpZ2l0cykgeyBzdGFjazEgPSBhbGlhczQuY2FsbChkZXB0aDAsc3RhY2sxLG9wdGlvbnMpfVxuICBpZiAoc3RhY2sxICE9IG51bGwpIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCIvXCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMTksIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM0LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgcmV0dXJuIGJ1ZmZlciArIFwiL1wiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnllYXIgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCJcXG4gICAgPC9zcGFuPlxcblwiO1xufSxcIjE3XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLm1vbnRoIDogc3RhY2sxKSwgZGVwdGgwKSk7XG59LFwiMTlcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZGF5IDogc3RhY2sxKSwgZGVwdGgwKSk7XG59LFwiMjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuaG91ciA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjIzXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLm1pbiA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjI1XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnNlYyA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjI3XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIgVDogXCI7XG59LFwiMjlcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlciwgYWxpYXMxPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sIGFsaWFzMj1oZWxwZXJzLmhlbHBlck1pc3NpbmcsIGFsaWFzMz1cImZ1bmN0aW9uXCIsIGFsaWFzND1jb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbiwgYWxpYXM1PWNvbnRhaW5lci5sYW1iZGE7XG5cbiAgcmV0dXJuIFwiICAgICAgPHRyIGNsYXNzPVxcXCJoaHYtcGxheWVyIFwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5wbGF5ZXJBY3Rpdml0eSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucGxheWVyQWN0aXZpdHkgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInBsYXllckFjdGl2aXR5XCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIlxcXCI+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnBvcyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucG9zIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJwb3NcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubmFtZSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubmFtZSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwibmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyAoKHN0YWNrMSA9IGFsaWFzNSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZENhcmRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMSA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgKChzdGFjazEgPSBhbGlhczUoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucmVuZGVyZWRDYXJkcyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDIgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwibVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5wcmVmbG9wIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5wcmVmbG9wIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJwcmVmbG9wXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLmZsb3AgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmZsb3AgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcImZsb3BcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHVybiB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudHVybiA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwidHVyblwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5yaXZlciB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucml2ZXIgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInJpdmVyXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnNob3dkb3duIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5zaG93ZG93biA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwic2hvd2Rvd25cIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICA8L3RyPlxcblwiO1xufSxcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlciwgb3B0aW9ucywgYWxpYXMxPWNvbnRhaW5lci5sYW1iZGEsIGFsaWFzMj1jb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbiwgYWxpYXMzPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sIGFsaWFzND1oZWxwZXJzLmhlbHBlck1pc3NpbmcsIGFsaWFzNT1cImZ1bmN0aW9uXCIsIGFsaWFzNj1oZWxwZXJzLmJsb2NrSGVscGVyTWlzc2luZywgYnVmZmVyID0gXG4gIFwiPGRpdiBjbGFzcz1cXFwiaGh2LWhhbmQgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuYW55QWN0aXZpdHkgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCIgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEucGxheWVyQWN0aXZpdHkgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCJcXFwiPlxcbiAgPGRpdiBjbGFzcz1cXFwiaGh2LWhlYWRlclxcXCI+XFxuICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtYmItc2ItYW50ZS1tYXhcXFwiPlxcbiAgICAgIChcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5iYiA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIi9cIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5zYiA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIilcXG5cIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczMsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuYW50ZSA6IHN0YWNrMSkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiICAgICAgW1wiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnRhYmxlIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5tYXhzZWF0cyA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIl1cXG4gICAgPC9zcGFuPlxcbiAgICA8c3BhbiBjbGFzcz1cXFwiaGh2LWJvYXJkXFxcIj5cXG5cIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczMsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJlbmRlcmVkQm9hcmQgOiBkZXB0aDApLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDMsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5wcm9ncmFtKDE0LCBkYXRhLCAwKSxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgPC9zcGFuPlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMywoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5kYXkgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDE2LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgPHNwYW4gY2xhc3M9XFxcImhodi1kYXRlXFxcIj5cXG4gICAgICBcIjtcbiAgc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy50d29kaWdpdHMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR3b2RpZ2l0cyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczQpLChvcHRpb25zPXtcIm5hbWVcIjpcInR3b2RpZ2l0c1wiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgyMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczUgPyBoZWxwZXIuY2FsbChhbGlhczMsb3B0aW9ucykgOiBoZWxwZXIpKTtcbiAgaWYgKCFoZWxwZXJzLnR3b2RpZ2l0cykgeyBzdGFjazEgPSBhbGlhczYuY2FsbChkZXB0aDAsc3RhY2sxLG9wdGlvbnMpfVxuICBpZiAoc3RhY2sxICE9IG51bGwpIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCI6XCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXM0KSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMjMsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXM1ID8gaGVscGVyLmNhbGwoYWxpYXMzLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM2LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgYnVmZmVyICs9IFwiOlwiO1xuICBzdGFjazEgPSAoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR3b2RpZ2l0cyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudHdvZGlnaXRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzNCksKG9wdGlvbnM9e1wibmFtZVwiOlwidHdvZGlnaXRzXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDI1LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzNSA/IGhlbHBlci5jYWxsKGFsaWFzMyxvcHRpb25zKSA6IGhlbHBlcikpO1xuICBpZiAoIWhlbHBlcnMudHdvZGlnaXRzKSB7IHN0YWNrMSA9IGFsaWFzNi5jYWxsKGRlcHRoMCxzdGFjazEsb3B0aW9ucyl9XG4gIGlmIChzdGFjazEgIT0gbnVsbCkgeyBidWZmZXIgKz0gc3RhY2sxOyB9XG4gIHJldHVybiBidWZmZXIgKyBcIlxcbiAgICA8L3NwYW4+XFxuICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtZ2FtZWluZm9cXFwiPlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IChoZWxwZXJzLmlmdmFsdWUgfHwgKGRlcHRoMCAmJiBkZXB0aDAuaWZ2YWx1ZSkgfHwgYWxpYXM0KS5jYWxsKGFsaWFzMywoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5nYW1ldHlwZSA6IHN0YWNrMSkse1wibmFtZVwiOlwiaWZ2YWx1ZVwiLFwiaGFzaFwiOntcInZhbHVlXCI6XCJ0b3VybmFtZW50XCJ9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgyNywgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuICAgICAgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZ2FtZW5vIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxuICAgICAgRzogXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuaGFuZGlkIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxuICAgIDwvc3Bhbj5cXG4gIDwvZGl2PlxcbiAgPGRpdiBjbGFzcz1cXFwiaGh2LXRhYmxlXFxcIj5cXG4gICAgPHRhYmxlPlxcbiAgICAgIDx0aGVhZD5cXG4gICAgICA8dHI+XFxuICAgICAgICA8dGg+UG9zPC90aD5cXG4gICAgICAgIDx0aD5OYW1lPC90aD5cXG4gICAgICAgIDx0aD5DYXJkczwvdGg+XFxuICAgICAgICA8dGg+TTwvdGg+XFxuICAgICAgICA8dGg+UHJlZmxvcDwvdGg+XFxuICAgICAgICA8dGg+RmxvcDwvdGg+XFxuICAgICAgICA8dGg+VHVybjwvdGg+XFxuICAgICAgICA8dGg+Uml2ZXI8L3RoPlxcbiAgICAgIDwvdHI+XFxuICAgICAgPC90aGVhZD5cXG4gICAgICA8dGJvZHk+XFxuXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVycy5lYWNoLmNhbGwoYWxpYXMzLChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5yZW5kZXJlZFBsYXllcnMgOiBkZXB0aDApLHtcIm5hbWVcIjpcImVhY2hcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMjksIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgICAgIDwvdGJvZHk+XFxuICAgIDwvdGFibGU+XFxuICA8L2Rpdj5cXG48L2Rpdj5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LCBhbGlhczI9aGVscGVycy5oZWxwZXJNaXNzaW5nLCBhbGlhczM9XCJmdW5jdGlvblwiLCBhbGlhczQ9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb247XG5cbiAgcmV0dXJuIFwiLmhodi1oYW5kIHtcXG4gIGRpc3BsYXk6IG5vbmU7XFxufVxcbi5oaHYtcGxheWVyIHtcXG4gIGRpc3BsYXk6IG5vbmU7XFxufVxcbi5oaHYtcGxheWVyXCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnBsYXllcnMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnBsYXllcnMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInBsYXllcnNcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiIHtcXG4gIGRpc3BsYXk6IHRhYmxlLXJvdztcXG59XFxuLmhodi1oYW5kXCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLmhhbmQgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmhhbmQgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcImhhbmRcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiIHtcXG4gIGRpc3BsYXk6IGJsb2NrO1xcbn1cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBoZWxwZXI7XG5cbiAgcmV0dXJuIFwidHIuXCJcbiAgICArIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubmFtZSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubmFtZSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBoZWxwZXJzLmhlbHBlck1pc3NpbmcpLCh0eXBlb2YgaGVscGVyID09PSBcImZ1bmN0aW9uXCIgPyBoZWxwZXIuY2FsbChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LHtcIm5hbWVcIjpcIm5hbWVcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiIHtcXG4gIGJhY2tncm91bmQ6IHJnYmEoMjEwLDI1NSw4MiwxKTtcXG4gIGJhY2tncm91bmQ6IC1tb3otbGluZWFyLWdyYWRpZW50KHRvcCwgcmdiYSgyMTAsMjU1LDgyLDEpIDAlLCByZ2JhKDE0NSwyMzIsNjYsMSkgMTAwJSk7XFxuICBiYWNrZ3JvdW5kOiAtd2Via2l0LWdyYWRpZW50KGxlZnQgdG9wLCBsZWZ0IGJvdHRvbSwgY29sb3Itc3RvcCgwJSwgcmdiYSgyMTAsMjU1LDgyLDEpKSwgY29sb3Itc3RvcCgxMDAlLCByZ2JhKDE0NSwyMzIsNjYsMSkpKTtcXG4gIGJhY2tncm91bmQ6IC13ZWJraXQtbGluZWFyLWdyYWRpZW50KHRvcCwgcmdiYSgyMTAsMjU1LDgyLDEpIDAlLCByZ2JhKDE0NSwyMzIsNjYsMSkgMTAwJSk7XFxuICBiYWNrZ3JvdW5kOiAtby1saW5lYXItZ3JhZGllbnQodG9wLCByZ2JhKDIxMCwyNTUsODIsMSkgMCUsIHJnYmEoMTQ1LDIzMiw2NiwxKSAxMDAlKTtcXG4gIGJhY2tncm91bmQ6IC1tcy1saW5lYXItZ3JhZGllbnQodG9wLCByZ2JhKDIxMCwyNTUsODIsMSkgMCUsIHJnYmEoMTQ1LDIzMiw2NiwxKSAxMDAlKTtcXG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCh0byBib3R0b20sIHJnYmEoMjEwLDI1NSw4MiwxKSAwJSwgcmdiYSgxNDUsMjMyLDY2LDEpIDEwMCUpO1xcbiAgZmlsdGVyOiBwcm9naWQ6RFhJbWFnZVRyYW5zZm9ybS5NaWNyb3NvZnQuZ3JhZGllbnQoIHN0YXJ0Q29sb3JzdHI9JyNkMmZmNTInLCBlbmRDb2xvcnN0cj0nIzkxZTg0MicsIEdyYWRpZW50VHlwZT0wICk7XFxufVxcblwiO1xufSxcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuc2VsZWN0ZWQgOiBkZXB0aDApLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpO1xufSxcInVzZURhdGFcIjp0cnVlfSk7XG4iLCIvLyBoYnNmeSBjb21waWxlZCBIYW5kbGViYXJzIHRlbXBsYXRlXG52YXIgSGFuZGxlYmFyc0NvbXBpbGVyID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzQ29tcGlsZXIudGVtcGxhdGUoe1wiY29tcGlsZXJcIjpbNyxcIj49IDQuMC4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiLmhodi1oYW5kIHtcXG4gIHdpZHRoOiA3MDBweDtcXG4gIGJhY2tncm91bmQ6ICMzMzM7XFxuICBib3JkZXI6IDFweCBzb2xpZCAjMzMzO1xcbiAgYm9yZGVyLXJhZGl1czogNnB4IDZweCAwIDA7XFxuICBib3gtc2hhZG93OiA2cHggNnB4IDEycHggIzg4ODtcXG4gIG1hcmdpbjogMCAwIDEwcHggMDtcXG59XFxuLmhodi1oZWFkZXIge1xcbiAgY29sb3I6IHllbGxvd2dyZWVuO1xcbiAgaGVpZ2h0OiAyMHB4O1xcbiAgcGFkZGluZzogMnB4O1xcbiAgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcXG59XFxuLmhodi1ib2FyZCB7XFxuICBiYWNrZ3JvdW5kOiBhbnRpcXVld2hpdGU7XFxuICBib3JkZXItcmFkaXVzOiAzcHg7XFxuICBoZWlnaHQ6IDIwcHg7XFxuICBjb2xvcjogYmxhY2s7XFxuICBwYWRkaW5nOiAxcHggMHB4IDFweCAycHg7XFxuICBtYXJnaW4tcmlnaHQ6IDNweDtcXG4gIG1pbi13aWR0aDogNjBweDtcXG59XFxuLmhodi1jYXJkLXZhbHVlLFxcbi5oaHYtY2FyZC1zdWl0IHtcXG4gIGZvbnQtZmFtaWx5OiB2ZXJkYW5hO1xcbiAgZm9udC1zaXplOiAxM3B4O1xcbn1cXG4uaGh2LWNhcmQtc3VpdCB7XFxuICBtYXJnaW4tcmlnaHQ6IDJweDtcXG4gIGZvbnQtc2l6ZTogMTVweDtcXG59XFxuLmhodi1jYXJkLXN1aXQucyxcXG4uaGh2LWNhcmQtc3VpdC5jIHtcXG4gIGNvbG9yOiBibGFjaztcXG59XFxuLmhodi1jYXJkLXN1aXQuZCxcXG4uaGh2LWNhcmQtc3VpdC5oIHtcXG4gIGNvbG9yOiByZWQ7XFxufVxcbi5oaHYtdGFibGUge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBmb250LWZhbWlseTogSW5jb25zb2xhdGEsIG1vbm9zcGFjZTtcXG59XFxuLmhodi10YWJsZSB0YWJsZSB7XFxuICBib3JkZXItc3BhY2luZzogMDtcXG59XFxuXFxuLmhodi10YWJsZSB0aCB7XFxuICB0ZXh0LWFsaWduOiBsZWZ0O1xcbiAgZm9udC1zaXplOiAxM3B4O1xcbn1cXG5cXG4uaGh2LXRhYmxlIHRkIHtcXG4gIHRleHQtYWxpZ246IGxlZnQ7XFxuICBwYWRkaW5nOiAwcHggMTBweCAwcHggMnB4O1xcbiAgd2hpdGUtc3BhY2U6IHByZTtcXG4gIGZvbnQtc2l6ZTogMTNweDtcXG59XFxuLmhodi10YWJsZSAuaGh2LWNhcmQtdmFsdWUsXFxuLmhodi10YWJsZSAuaGh2LWNhcmQtc3VpdCB7XFxuICBmb250LXNpemU6IDEzcHg7XFxufVxcblxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDEpIHsgd2lkdGg6IDEwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCgyKSB7IHdpZHRoOiAxMDBweDsgfVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDMpIHsgd2lkdGg6IDMwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCg0KSB7IHdpZHRoOiAxMHB4OyB0ZXh0LWFsaWduOiByaWdodDt9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoNSkgeyB3aWR0aDogMTAwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCg2KSB7IHdpZHRoOiAxMDBweDsgfVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDcpIHsgd2lkdGg6IDEwMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoOCkgeyB3aWR0aDogMTAwcHg7IH1cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcIjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlciwgYWxpYXMxPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sIGFsaWFzMj1oZWxwZXJzLmhlbHBlck1pc3NpbmcsIGFsaWFzMz1cImZ1bmN0aW9uXCIsIGFsaWFzND1jb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbjtcblxuICByZXR1cm4gXCIgICAgPGxpPlxcbiAgICAgIDxpbnB1dCB0eXBlPVxcXCJyYWRpb1xcXCIgbmFtZT1cXFwicGxheWVyc1xcXCIgdmFsdWU9XFxcIlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5uYW1lIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5uYW1lIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJuYW1lXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIlxcXCJcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmlzSGVybyA6IGRlcHRoMCkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiLz5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubmFtZSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubmFtZSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwibmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCJcXG4gICAgPC9saT5cXG5cIjtcbn0sXCIyXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIgY2hlY2tlZFwiO1xufSxcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwiaGh2LWZpbHRlci1wbGF5ZXJzXFxcIj5cXG4gIDxoMz5QbGF5ZXJzPC9oMz5cXG4gIDx1bD5cXG5cIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzLmVhY2guY2FsbChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5wbGF5ZXJzIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJlYWNoXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiAgPC91bD5cXG48L2Rpdj5cXG48ZGl2IGNsYXNzPVxcXCJoaHYtZmlsdGVyLXNob3dcXFwiPlxcbiAgPGgzPlNob3c8L2gzPlxcbiAgPHVsPlxcbiAgICA8bGk+PGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJzaG93XFxcIiB2YWx1ZT1cXFwiYWxsXFxcIiBjaGVja2VkLz5BbGw8L2xpPlxcbiAgICA8bGk+PGlucHV0IHR5cGU9XFxcInJhZGlvXFxcIiBuYW1lPVxcXCJzaG93XFxcIiB2YWx1ZT1cXFwiaW52ZXN0ZWRcXFwiLz5Nb25leSBJbnZlc3RlZDwvbGk+XFxuICAgIDxsaT48aW5wdXQgdHlwZT1cXFwicmFkaW9cXFwiIG5hbWU9XFxcInNob3dcXFwiIHZhbHVlPVxcXCJzYXdGbG9wXFxcIi8+U2F3IEZsb3A8L2xpPlxcbiAgPC91bD5cXG48L2Rpdj5cXG48ZGl2IGNsYXNzPVxcXCJoaHYtZmlsdGVyLWRpc3BsYXlcXFwiPlxcbiAgPGgzPkRpc3BsYXk8L2gzPlxcbiAgPHVsPlxcbiAgICA8bGk+PGlucHV0IHR5cGU9XFxcImNoZWNrYm94XFxcIiBuYW1lPVxcXCJkaXNwbGF5XFxcIiB2YWx1ZT1cXFwic2VsZWN0UGxheWVyXFxcIi8+U2VsZWN0IFBsYXllcjwvbGk+XFxuICAgIDxsaT48aW5wdXQgdHlwZT1cXFwiY2hlY2tib3hcXFwiIG5hbWU9XFxcImRpc3BsYXlcXFwiIHZhbHVlPVxcXCJpbmFjdGl2ZVxcXCIvPkluYWN0aXZlIFBsYXllcnM8L2xpPlxcbiAgPC91bD5cXG48L2Rpdj5cXG5cIjtcbn0sXCJ1c2VEYXRhXCI6dHJ1ZX0pO1xuIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImluZm9cIjoge1xuICAgIFwicm9vbVwiOiBcInBva2Vyc3RhcnNcIixcbiAgICBcImhhbmRpZFwiOiBcIjE0OTY1MTk5MjU0OFwiLFxuICAgIFwiZ2FtZXR5cGVcIjogXCJ0b3VybmFtZW50XCIsXG4gICAgXCJnYW1lbm9cIjogXCIxNDk1MTkyNjMwXCIsXG4gICAgXCJjdXJyZW5jeVwiOiBcIiRcIixcbiAgICBcImRvbmF0aW9uXCI6IDAuOTEsXG4gICAgXCJyYWtlXCI6IDAuMDksXG4gICAgXCJidXlpblwiOiAxLFxuICAgIFwicG9rZXJ0eXBlXCI6IFwiaG9sZGVtXCIsXG4gICAgXCJsaW1pdFwiOiBcIm5vbGltaXRcIixcbiAgICBcImxldmVsXCI6IFwieGkgXCIsXG4gICAgXCJzYlwiOiA0MDAsXG4gICAgXCJiYlwiOiA4MDAsXG4gICAgXCJ5ZWFyXCI6IDIwMTYsXG4gICAgXCJtb250aFwiOiAzLFxuICAgIFwiZGF5XCI6IDEsXG4gICAgXCJob3VyXCI6IDEsXG4gICAgXCJtaW5cIjogMjksXG4gICAgXCJzZWNcIjogNDEsXG4gICAgXCJ0aW1lem9uZVwiOiBcIkVUXCIsXG4gICAgXCJhbnRlXCI6IDUwLFxuICAgIFwicGxheWVyc1wiOiA0LFxuICAgIFwiYW55SW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICBcImFueVNhd0Zsb3BcIjogdHJ1ZVxuICB9LFxuICBcInRhYmxlXCI6IHtcbiAgICBcInRhYmxlbm9cIjogMyxcbiAgICBcIm1heHNlYXRzXCI6IDksXG4gICAgXCJidXR0b25cIjogM1xuICB9LFxuICBcImJvYXJkXCI6IHtcbiAgICBcImNhcmQxXCI6IFwiM2NcIixcbiAgICBcImNhcmQyXCI6IFwiSmNcIixcbiAgICBcImNhcmQzXCI6IFwiM2hcIixcbiAgICBcImNhcmQ0XCI6IFwiNmhcIixcbiAgICBcImNhcmQ1XCI6IFwiM2RcIlxuICB9LFxuICBcInBsYXllcnNcIjogW1xuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDQsXG4gICAgICBcImNoaXBzXCI6IDE1NDUxLFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMTUwMDEsXG4gICAgICBcImNoaXBzRmxvcFwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDE1MDAxLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDE1MDAxLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDE1MDAxLFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDE1MDAxLFxuICAgICAgXCJtXCI6IDExLFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImZvbGRcIixcbiAgICAgICAgICBcInBvdFwiOiA0NjAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwic2JcIjogdHJ1ZSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDIsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMCxcbiAgICAgIFwicG9zXCI6IFwic2JcIixcbiAgICAgIFwibmFtZVwiOiBcIkRtZWxsb0hcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogOSxcbiAgICAgIFwiY2hpcHNcIjogMjIwNjAsXG4gICAgICBcImNoaXBzUHJlZmxvcFwiOiAyMTIxMCxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc1R1cm5cIjogMjEyMTAsXG4gICAgICBcImNoaXBzUml2ZXJcIjogMjEyMTAsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogMjEyMTAsXG4gICAgICBcImNoaXBzQWZ0ZXJcIjogMjEyMTAsXG4gICAgICBcIm1cIjogMTYsXG4gICAgICBcInByZWZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiZm9sZFwiLFxuICAgICAgICAgIFwicG90XCI6IDQ2MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtdLFxuICAgICAgXCJoZXJvXCI6IHRydWUsXG4gICAgICBcImNhcmRzXCI6IHtcbiAgICAgICAgXCJjYXJkMVwiOiBcIjRjXCIsXG4gICAgICAgIFwiY2FyZDJcIjogXCIyZFwiXG4gICAgICB9LFxuICAgICAgXCJiYlwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMyxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAxLFxuICAgICAgXCJwb3NcIjogXCJiYlwiLFxuICAgICAgXCJuYW1lXCI6IFwiaGVsZFwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiAxLFxuICAgICAgXCJjaGlwc1wiOiAxNTg3NSxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDE1ODI1LFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMTQyMjUsXG4gICAgICBcImNoaXBzVHVyblwiOiAxMTgyNSxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAxMDIyNSxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiA3MDI1LFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDcwMjUsXG4gICAgICBcIm1cIjogMTEsXG4gICAgICBcInByZWZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwicmFpc2VcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDIsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAxNjAwLFxuICAgICAgICAgIFwicG90XCI6IDE0MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJiZXRcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuNSxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDI0MDAsXG4gICAgICAgICAgXCJwb3RcIjogNDYwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJ0dXJuXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNoZWNrXCIsXG4gICAgICAgICAgXCJwb3RcIjogOTQwMFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2FsbFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4xLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMTYwMCxcbiAgICAgICAgICBcInBvdFwiOiAxMTAwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJyaXZlclwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjaGVja1wiLFxuICAgICAgICAgIFwicG90XCI6IDEyNjAwXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjIsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAzMjAwLFxuICAgICAgICAgIFwicG90XCI6IDE1ODAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcInNob3dkb3duXCI6IFtdLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMCxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAyLFxuICAgICAgXCJwb3NcIjogXCJjb1wiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCJUZFwiLFxuICAgICAgICBcImNhcmQyXCI6IFwiVGNcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIkZpc2NoZXJzaXRvXCIsXG4gICAgICBcImludmVzdGVkXCI6IHRydWUsXG4gICAgICBcInNhd0Zsb3BcIjogdHJ1ZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogMyxcbiAgICAgIFwiY2hpcHNcIjogMTQxMTQsXG4gICAgICBcImNoaXBzUHJlZmxvcFwiOiAxNDA2NCxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDEyNDY0LFxuICAgICAgXCJjaGlwc1R1cm5cIjogMTAwNjQsXG4gICAgICBcImNoaXBzUml2ZXJcIjogODQ2NCxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiA1MjY0LFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDI0MjY0LFxuICAgICAgXCJtXCI6IDEwLFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuNSxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MDAsXG4gICAgICAgICAgXCJwb3RcIjogMzAwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMyxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDI0MDAsXG4gICAgICAgICAgXCJwb3RcIjogNzAwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJ0dXJuXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJldFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4yLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMTYwMCxcbiAgICAgICAgICBcInBvdFwiOiA5NDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcInJpdmVyXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJldFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4zLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMzIwMCxcbiAgICAgICAgICBcInBvdFwiOiAxMjYwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjb2xsZWN0XCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAxLFxuICAgICAgICAgIFwid2luYWxsXCI6IHRydWUsXG4gICAgICAgICAgXCJhbW91bnRcIjogMTkwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiYnV0dG9uXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAxLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDMsXG4gICAgICBcInBvc1wiOiBcImJ1XCIsXG4gICAgICBcImNhcmRzXCI6IHtcbiAgICAgICAgXCJjYXJkMVwiOiBcIlFzXCIsXG4gICAgICAgIFwiY2FyZDJcIjogXCJKaFwiXG4gICAgICB9LFxuICAgICAgXCJuYW1lXCI6IFwiSXJpc2hhMlwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IHRydWVcbiAgICB9XG4gIF1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiaW5mb1wiOiB7XG4gICAgXCJyb29tXCI6IFwicG9rZXJzdGFyc1wiLFxuICAgIFwiaGFuZGlkXCI6IFwiMTQ5NjUyMDU5NDIyXCIsXG4gICAgXCJnYW1ldHlwZVwiOiBcInRvdXJuYW1lbnRcIixcbiAgICBcImdhbWVub1wiOiBcIjE0OTUxOTI2MzBcIixcbiAgICBcImN1cnJlbmN5XCI6IFwiJFwiLFxuICAgIFwiZG9uYXRpb25cIjogMC45MSxcbiAgICBcInJha2VcIjogMC4wOSxcbiAgICBcImJ1eWluXCI6IDEsXG4gICAgXCJwb2tlcnR5cGVcIjogXCJob2xkZW1cIixcbiAgICBcImxpbWl0XCI6IFwibm9saW1pdFwiLFxuICAgIFwibGV2ZWxcIjogXCJ4aSBcIixcbiAgICBcInNiXCI6IDQwMCxcbiAgICBcImJiXCI6IDgwMCxcbiAgICBcInllYXJcIjogMjAxNixcbiAgICBcIm1vbnRoXCI6IDMsXG4gICAgXCJkYXlcIjogMSxcbiAgICBcImhvdXJcIjogMSxcbiAgICBcIm1pblwiOiAzMyxcbiAgICBcInNlY1wiOiA1NCxcbiAgICBcInRpbWV6b25lXCI6IFwiRVRcIixcbiAgICBcImFudGVcIjogNTAsXG4gICAgXCJwbGF5ZXJzXCI6IDQsXG4gICAgXCJhbnlJbnZlc3RlZFwiOiB0cnVlLFxuICAgIFwiYW55U2F3RmxvcFwiOiBmYWxzZVxuICB9LFxuICBcInRhYmxlXCI6IHtcbiAgICBcInRhYmxlbm9cIjogMyxcbiAgICBcIm1heHNlYXRzXCI6IDksXG4gICAgXCJidXR0b25cIjogM1xuICB9LFxuICBcImJvYXJkXCI6IHtcbiAgICBcImNhcmQxXCI6IFwiOGhcIixcbiAgICBcImNhcmQyXCI6IFwiS2RcIixcbiAgICBcImNhcmQzXCI6IFwiMnNcIixcbiAgICBcImNhcmQ0XCI6IFwiNnNcIixcbiAgICBcImNhcmQ1XCI6IFwiNHNcIlxuICB9LFxuICBcInBsYXllcnNcIjogW1xuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDQsXG4gICAgICBcImNoaXBzXCI6IDMzMzAyLFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMzI4NTIsXG4gICAgICBcImNoaXBzRmxvcFwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDI2ODkzLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDI2ODkzLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDI2ODkzLFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDI2ODkzLFxuICAgICAgXCJtXCI6IDI0LFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuNixcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDMwMjUsXG4gICAgICAgICAgXCJwb3RcIjogNDgyNVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2FsbFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4yLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMjkzNCxcbiAgICAgICAgICBcInBvdFwiOiAxNDIwOVxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW10sXG4gICAgICBcInNiXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAyLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc1wiOiBcInNiXCIsXG4gICAgICBcImNhcmRzXCI6IHtcbiAgICAgICAgXCJjYXJkMVwiOiBcIjdoXCIsXG4gICAgICAgIFwiY2FyZDJcIjogXCI3ZFwiXG4gICAgICB9LFxuICAgICAgXCJuYW1lXCI6IFwiRG1lbGxvSFwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiA5LFxuICAgICAgXCJjaGlwc1wiOiA2NDA5LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogNTU1OSxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDAsXG4gICAgICBcImNoaXBzVHVyblwiOiAwLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDAsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogMCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAxNjM0MyxcbiAgICAgIFwibVwiOiA1LFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcInJhaXNlXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAxLjksXG4gICAgICAgICAgXCJhbGxpblwiOiB0cnVlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDU1NTksXG4gICAgICAgICAgXCJwb3RcIjogNzg1MFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY29sbGVjdFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMSxcbiAgICAgICAgICBcIndpbmFsbFwiOiB0cnVlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MzQzXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImhlcm9cIjogdHJ1ZSxcbiAgICAgIFwiY2FyZHNcIjoge1xuICAgICAgICBcImNhcmQxXCI6IFwiUWRcIixcbiAgICAgICAgXCJjYXJkMlwiOiBcIlFzXCJcbiAgICAgIH0sXG4gICAgICBcImJiXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAzLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDEsXG4gICAgICBcInBvc1wiOiBcImJiXCIsXG4gICAgICBcIm5hbWVcIjogXCJoZWxkXCIsXG4gICAgICBcImludmVzdGVkXCI6IHRydWUsXG4gICAgICBcInNhd0Zsb3BcIjogZmFsc2VcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDEsXG4gICAgICBcImNoaXBzXCI6IDM0NzUsXG4gICAgICBcImNoaXBzUHJlZmxvcFwiOiAzNDI1LFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDAsXG4gICAgICBcImNoaXBzUml2ZXJcIjogMCxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAwLFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDAsXG4gICAgICBcIm1cIjogMixcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJyYWlzZVwiLFxuICAgICAgICAgIFwicmF0aW9cIjogNC4zLFxuICAgICAgICAgIFwiYWxsaW5cIjogdHJ1ZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAzNDI1LFxuICAgICAgICAgIFwicG90XCI6IDE0MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtdLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMCxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAyLFxuICAgICAgXCJwb3NcIjogXCJjb1wiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCJBZFwiLFxuICAgICAgICBcImNhcmQyXCI6IFwiMmNcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIkZpc2NoZXJzaXRvXCIsXG4gICAgICBcImludmVzdGVkXCI6IHRydWUsXG4gICAgICBcInNhd0Zsb3BcIjogZmFsc2VcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDMsXG4gICAgICBcImNoaXBzXCI6IDI0MzE0LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMjQyNjQsXG4gICAgICBcImNoaXBzRmxvcFwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDI0MjY0LFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDI0MjY0LFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDI0MjY0LFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDI0MjY0LFxuICAgICAgXCJtXCI6IDE3LFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImZvbGRcIixcbiAgICAgICAgICBcInBvdFwiOiA0ODI1XG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwiYnV0dG9uXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAxLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDMsXG4gICAgICBcInBvc1wiOiBcImJ1XCIsXG4gICAgICBcIm5hbWVcIjogXCJJcmlzaGEyXCIsXG4gICAgICBcImludmVzdGVkXCI6IGZhbHNlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfVxuICBdXG59Il19
