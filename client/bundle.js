(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (__dirname){
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
module.exports = function analyze (hand) {
  if (!hand.info) throw new Error('Hand is missing info')
  if (hand.info.pokertype === 'holdem') return analyzeHoldem(hand)
}

// Test
function inspect (obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, true))
}
if (!module.parent && typeof window === 'undefined') {
  const fs = require('fs')
  const path = require('path')
  const hhv_fixtures = path.join(__dirname, '..', 'hhv', 'test', 'fixtures', 'holdem')

  // const name = 'actiononall'
  const name = 'allin-preflop'

  const hand = require('./test/fixtures/holdem/' + name + '.json')
  const analyzed = module.exports(hand)

  inspect(analyzed)

  fs.writeFileSync(path.join(hhv_fixtures, name + '.json'),
                   JSON.stringify(analyzed, null, 2),
                   'utf8')
}

}).call(this,"/node_modules/hha")

},{"./lib/holdem":2,"fs":12,"path":14,"util":17}],2:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'
const cardOrder = [ '2', '3', '4', '5', '6', '7', '8', 'T', 'J', 'Q', 'K', 'A' ]

function round (n) {
  return Math.round(n * 10) / 10
}

function notmetadata (k) {
  return k !== 'metadata'
}

function copyValues (o) {
  function copy (acc, k) {
    acc[k] = o[k]
    return acc
  }
  if (!o) return o
  return Object.keys(o)
    .filter(notmetadata)
    .reduce(copy, {})
}

function normalizeHoleCards (hc) {
  if (!hc) return hc
  const c1 = hc.card1
  const c2 = hc.card2
  if (!c1 || !c2) return hc
  // show large card before smaller card
  return cardOrder.indexOf(c1[0]) < cardOrder.indexOf(c2[0])
    ? { card1: c2, card2: c1 } : { card1: c1, card2: c2 }
}

function getStartingPot (o, playerCount) {
  const totalAnte = (o.ante || 0) * playerCount
  return  (o.sb || 0) + (o.bb || 0) + totalAnte
}

function postFlopOrderFromPreflopOrder (n, playerCount) {
  // headsup just reverses the order
  if (playerCount === 2) return n === 0 ? 1 : 0

  if (n === (playerCount - 1)) return 1 // BB
  if (n === (playerCount - 2)) return 0 // SB
  return n + 2
}

function strategicPositionFromPostFlopOrder (n, playerCount) {
  // n is position in which player 'would have' acted on flop and after
  // 'would have' because he may have folded preflop ;)

  // headsup
  if (playerCount === 2) {
    if (n === 0) return 'bb'
    if (n === 1) return 'sb'
  }

  // no headsup

  // blinds
  if (n === 0) return 'sb'
  if (n === 1) return 'bb'

  // othersk
  switch (playerCount - n) {
    case 1: return 'bu'
    case 2: return 'co'
    case 3: return 'lt'
    case 4:
    case 5:
      return 'mi'
    case 6:
    case 7:
    case 8:
      return 'ea'
  }
}

function byPostFlopOrder (p1, p2) {
  return p1.postflopOrder - p2.postflopOrder
}

function sortPlayersByPostFlopOrder (players) {
  function appendPlayer (acc, k) {
    const p = players[k]
    p.name = k
    acc.push(p)
    return acc
  }
  return Object.keys(players)
    .reduce(appendPlayer, [])
    .sort(byPostFlopOrder)
}

function playerInvested (preflop) {
  for (let i = 0; i < preflop.length; i++) {
    const action = preflop[i].type
    if (action === 'bet' || action === 'call' || action === 'raise') return true
  }
  return false
}

function playerSawShowdown (p) {
  if (p.showdown.length) return true
  if (p.river.length && p.river[p.river.length - 1].type !== 'fold') return true
  return false
}

function addActivityInfo (players, info) {
  let anyInvested    = false
  let anySawFlop     = false
  for (let i = 0; i < players.length; i++) {
    const player       = players[i]
    player.invested    = player.sb || player.bb || playerInvested(player.preflop)
    player.sawFlop     = !!player.flop.length

    if (!anyInvested) anyInvested = player.invested
    if (!anySawFlop) anySawFlop   = player.sawFlop
  }

  info.anyInvested    = anyInvested
  info.anySawFlop     = anySawFlop
}

function updateChips (prev, current, investeds, players, hand) {
  Object.keys(players)
    .forEach(updatePlayerChips, { prev: prev, current: current })

  function updatePlayerChips (k) {
    const p = players[k]
    let chips = p[this.prev] - (investeds[k] || 0)
    if (this.prev === 'chipsPreflop') {
      if (p.bb) chips += hand.info.bb
      if (p.sb) chips += hand.info.sb
    }
    p.chipsAfter = p[this.current] = chips
  }
}

module.exports = function analyzeHoldem (hand) {
  let pot = 0
  let currentBet = hand.info.bb

  const playerCount = hand.seats.length
  const startingPot = getStartingPot(hand.info, playerCount)

  const players = {}
  const analyzed = {
      info    : copyValues(hand.info)
    , table   : copyValues(hand.table)
    , board   : copyValues(hand.board)
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

  function analyzeAction (p, invested) {
    const startingPot = pot
    let cost = 0
    const action = {
        type: p.type
    }
    if (p.type === 'raise') {
      action.ratio = round(p.raiseTo / currentBet)
      action.allin = !!p.allin
      action.amount = p.raiseTo - invested
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
    }
    action.pot = startingPot
    return { action: action, cost: cost || 0 }
  }

  let investeds = {}

  function startPreflopCost (p) {
    if (p.bb) return hand.info.bb
    if (p.sb) return hand.info.sb
    return 0
  }

  for (let i = 0; i < hand.preflop.length; i++) {
    const p = hand.preflop[i]
    const player = players[p.player]
    const invested = investeds[p.player] || startPreflopCost(player)
    const info = analyzeAction(p, invested)
    player.preflop.push(info.action)
    if (!player.hasOwnProperty('preflopOrder')) {
      player.preflopOrder = i
      player.postflopOrder = postFlopOrderFromPreflopOrder(i, playerCount)
      player.pos = strategicPositionFromPostFlopOrder(player.postflopOrder, playerCount)
    }
    investeds[p.player] = invested + info.cost
  }
  updateChips('chipsPreflop', 'chipsFlop', investeds, players, hand)

  investeds = {}
  for (let i = 0; i < hand.flop.length; i++) {
    const p = hand.flop[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    player.flop.push(info.action)
    investeds[p.player] = invested + info.cost
  }
  updateChips('chipsFlop', 'chipsTurn', investeds, players, hand)

  investeds = {}
  for (let i = 0; i < hand.turn.length; i++) {
    const p = hand.turn[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    player.turn.push(info.action)
    investeds[p.player] = invested + info.cost
  }
  updateChips('chipsTurn', 'chipsRiver', investeds, players, hand)

  investeds = {}
  for (let i = 0; i < hand.river.length; i++) {
    const p = hand.river[i]
    const player = players[p.player]
    const invested = investeds[p.player] || 0
    const info = analyzeAction(p, invested)
    player.river.push(info.action)
    investeds[p.player] = invested + info.cost
  }
  updateChips('chipsRiver', 'chipsShowdown', investeds, players, hand)

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
  function processCollecteds (k) {
    const player = players[k]
    const amount = collecteds[k]
    const ratio = round(amount / pot)
    const action = {
        type   : 'collect'
      , ratio  : ratio
      , winall : ratio === 1
      , amount : amount
    }
    player.showdown.push(action)
    player.chipsAfter += amount
  }

  analyzed.players = sortPlayersByPostFlopOrder(players)
  addActivityInfo(analyzed.players, analyzed.info)
  return analyzed
}

},{}],3:[function(require,module,exports){
(function (__dirname){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const stringUtil = require('./lib/util/string')

const holdem_ps = require('./lib/holdem/pokerstars')

function getLines (txt) {
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
 * @return {object} representation of the given hand to be used as input for other tools like hha
 */
exports = module.exports = function parse (input) {
  const lines = Array.isArray(input) ? input : getLines(input).filter(stringUtil.emptyLine)
  if (holdem_ps.canParse(lines)) return holdem_ps.parse(lines)
}

/**
 * Extracts all hands from a given text file.
 *
 * @name extractHands
 * @function
 * @param {string} txt the text containing the hands
 * @return {Array.<Array>} an array of hands, each hand split into lines
 */
exports.extractHands = function extractHands (txt) {
  const lines = getLines(txt)
  const hands = []
  let hand = []

  let i = 0
  while (i < lines.length && lines[i] && !lines[i].length) i++   // ignore leading empty lines
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.length) {
      hand.push(line)
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

function inspect (obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, true))
}

if (!module.parent && typeof window === 'undefined') {
  // const name = 'allin-preflop'
  const name = 'actiononall'
  const fs = require('fs')
  const path = require('path')
  const fixtures = path.join(__dirname, 'test', 'fixtures', 'holdem')
  const allhands = fs.readFileSync(path.join(__dirname, 'test', 'fixtures', 'hands.txt'), 'utf8')
  const res = exports.extractHands(allhands)
  inspect(res)
  /*const hha_fixtures = path.join(__dirname, '..', 'hha', 'test', 'fixtures', 'holdem')
  const txt = fs.readFileSync(path.join(fixtures, 'pokerstars', name + '.txt'), 'utf8')

  const res = module.exports(txt)
  inspect(res)
  fs.writeFileSync(path.join(hha_fixtures, name + '.json'),
                   JSON.stringify(res, null, 2),
                   'utf8')*/
}

}).call(this,"/node_modules/hhp")

},{"./lib/holdem/pokerstars":5,"./lib/util/string":6,"fs":12,"path":14,"util":17}],4:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const stringUtil     = require('../util/string')
const safeParseInt   = stringUtil.safeParseInt
const safeParseFloat = stringUtil.safeParseFloat
const safeTrim       = stringUtil.safeTrim
const safeLower      = stringUtil.safeLower
const safeUpper      = stringUtil.safeUpper
const safeFirstUpper = stringUtil.safeFirstUpper

function HandHistoryParser (lines) {
  if (!(this instanceof HandHistoryParser)) return new HandHistoryParser(lines)

  this._lines = lines

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
proto._showRx              = undefined
proto._boardRx             = undefined
proto._muckRx              = undefined

proto._preflopIndicator = function _preflopIndicator (line, lineno) {
  return this._preflopIndicatorRx.test(line)
}

proto._showdownIndicator = function _showdownIndicator (line, lineno) {
  return this._showdownIndicatorRx.test(line)
}

proto._summaryIndicator =  function _summaryIndicator (line, lineno) {
  return this._summaryIndicatorRx.test(line)
}

proto._identifyPokerType = function _identifyPokerType (s) {
  if (typeof s === 'undefined') return undefined
  return  (/hold'?em/i).test(s) ? 'holdem'
        : (/omaha/i).test(s)    ? 'omaha'
        : 'not yet supported'
}

proto._identifyLimit = function _identifyLimit (s) {
  if (typeof s === 'undefined') return undefined

  return  (/(no ?limit|nl)/i).test(s)  ? 'nolimit'
        : (/(pot ?limit|pl)/i).test(s) ? 'potlimit'
        : 'not yet supported'
}

proto._readInfo = function _readInfo (line, lineno) {
  const match    = line.match(this._handInfoRx)
  if (!match) return

  const donation = safeParseFloat(match[6])
  const rake     = safeParseFloat(match[8])

  this.hand.info = {
      room      : safeLower(match[1])
    , handid    : match[2]
    , gametype  : safeLower(match[3])
    , gameno    : match[4]
    , currency  : match[5]
    , donation  : safeParseFloat(donation)
    , rake      : safeParseFloat(rake)
    , buyin     : donation + rake
    , pokertype : this._identifyPokerType(match[9])
    , limit     : this._identifyLimit(match[10])
    , level     : safeLower(match[11])
    , sb        : safeParseFloat(match[12])
    , bb        : safeParseFloat(match[13])
    , year      : safeParseInt(match[14])
    , month     : safeParseInt(match[15])
    , day       : safeParseInt(match[16])
    , hour      : safeParseInt(match[17])
    , min       : safeParseInt(match[18])
    , sec       : safeParseInt(match[19])
    , timezone  : safeUpper(match[20])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  return true
}

proto._readTable = function _readTable (line, lineno) {
  const match = line.match(this._tableInfoRx)
  if (!match) return

  this.hand.table = {
      tableno  : safeParseInt(match[1])
    , maxseats : safeParseInt(match[2])
    , button   : safeParseInt(match[3])
    , metadata: {
        lineno: lineno
      , raw: line
    }
  }
  return true
}

proto._readSeat = function _readSeat (line, lineno) {
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

proto._postType = function _postType (s) {
  return  s === 'ante' ?  'ante'
        : s === 'big blind' ? 'bb'
        : s === 'small blind' ? 'sb'
        : 'unknown'
}

proto._readPost = function _readPost (line, lineno) {
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

proto._readHoleCards = function _readHoleCards (line, lineno) {
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

proto._readStreet = function _readStreet (line, lineno) {
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

proto._readShow =  function _readShow (line, lineno) {
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

proto._readMuck = function _readMuck (line, lineno) {
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

proto._readBoard = function _readBoard (line, lineno) {
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

function actionType (s) {
  return s.replace(/(ed|s)$/, '')
}

proto._readAction = function _readAction (line, lineno) {
  const match = this._sawShowdown ? line.match(this._collectRx) : line.match(this._actionRx)
  if (!match) return

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
  return true
}

proto.parse = function parse () {
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
      if (!this.hand.info)   if (this._readInfo(lines[i], i)) continue
      if (!this.hand.table)  if (this._readTable(lines[i], i)) continue
      if (this._readSeat(lines[i], i)) continue
    }
  }
  return this.hand
}

proto.canParse = function canParse () {
  const lines = this._lines
  for (let i = 0; i < lines.length && lines[i].length; i++) {
    if (this._handInfoRx.test(lines[i])) return true
  }
  return false
}

module.exports = HandHistoryParser

},{"../util/string":6}],5:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const HandHistoryParser = require('./base')

function HoldemPokerStarsParser (lines) {
  if (!(this instanceof HoldemPokerStarsParser)) return new HoldemPokerStarsParser(lines)
  HandHistoryParser.call(this, lines)
}

HoldemPokerStarsParser.prototype = Object.create(HandHistoryParser.prototype)
HoldemPokerStarsParser.prototype.constructor = HoldemPokerStarsParser
const proto = HoldemPokerStarsParser.prototype

proto._handInfoRx = new RegExp(
    // PokerStars Hand #149651992548:
    '^(PokerStars) Hand #(\\d+): '
    // Tournament #1495192630,
  + '(Tournament) #(\\d+), '
    // $0.91+$0.09
  + '([$|€])([\\d]+\\.\\d+)\\+([$|€])([\\d]+\\.\\d+).+'
    // USD Hold'em No Limit -
  + '(Hold\'em) (No Limit) - '
    // Level XI (400/800)
  + 'Level ([^(]+)\\(([^/]+)/([^)]+)\\)'
    // 2016/03/01
  + '[^\\d]*(\\d{4}).(\\d{2}).(\\d{2})'
    // 1:29:41 ET
  + '[^\\d]*([^:]+):([^:]+):([^ ]+) (.+)$'
)

/*
 * Matches:
 *    1  PokerStars         2  149651992548  3  Tournament  4  1495192630
 *    5  $                  6  0.91  7  $    8 0.09
 *    9  Hold'em           10 No Limit      11 XI          12 400  13 800
 *    14 2016              15 03    16 01
 *    17 1                 18 29    19 41   20 ET
*/

proto._tableInfoRx         = /^Table '\d+ (\d+)' (\d+)-max Seat #(\d+) is.+button$/
proto._seatInfoRx          = /^Seat (\d+): ([^(]+)\((\d+) in chips\)$/
proto._postRx              = /^([^:]+): posts (?:the )?(ante|small blind|big blind) (\d+)$/
proto._preflopIndicatorRx  = /^\*\*\* HOLE CARDS \*\*\*$/
proto._streetIndicatorRx   = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*[^[]+\[(..) (..) (..)(?: (..))?\](?: \[(..)\])?$/
proto._showdownIndicatorRx = /^\*\*\* SHOW DOWN \*\*\*$/
proto._summaryIndicatorRx  = /^\*\*\* SUMMARY \*\*\*$/
proto._holecardsRx         = /^Dealt to ([^[]+) \[(..) (..)\]$/
proto._actionRx            = /^([^:]+): (raises|bets|calls|checks|folds) ?(\d+)?(?: to (\d+))?(.+all-in)?$/
proto._collectRx           = /^([^ ]+) (collected) (\d+) from.+pot$/
proto._showRx              = /^([^:]+): shows \[(..) (..)\] \(([^)]+)\)$/
proto._boardRx             = /^Board \[(..)?( ..)?( ..)?( ..)?( ..)?]$/
proto._muckRx              = /^Seat \d+: ([^ ]+) mucked \[(..) (..)\]$/

exports.canParse = function canParse (lines) {
  return new HoldemPokerStarsParser(lines).canParse()
}

exports.parse = function parse (lines) {
  return new HoldemPokerStarsParser(lines).parse()
}

},{"./base":4}],6:[function(require,module,exports){
'use strict'

exports.trimLine = function trimLine (line) { return line.trim() }
exports.emptyLine = function emptyLine (line) { return line.length }
exports.safeLower = function safeLower (s) {
  return typeof s === 'undefined'
    ? undefined
    : s.toLowerCase()
}
exports.safeUpper = function safeUpper (s) {
  return typeof s === 'undefined'
    ? undefined
    : s.toUpperCase()
}
exports.safeFirstUpper = function safeFirstUpper (s) {
  return typeof s === 'undefined' || s.length < 1
    ? s
    : s[0].toUpperCase() + s.slice(1)
}
exports.safeTrim = function safeTrim (s) {
  return typeof s === 'undefined'
    ? undefined
    : s.trim()
}
exports.safeParseInt = function safeParseInt (s) {
  return typeof s === 'undefined'
    ? undefined
    : parseInt(s)
}
exports.safeParseFloat = function safeParseFloat (s) {
  return typeof s === 'undefined'
    ? undefined
    : parseFloat(s)
}

},{}],7:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const hhv = require('../hhv')
const hhp = require('hhp')
const hha = require('hha')

const visualizedHandsEl = document.getElementById('visualized-hands')
const handhistoryEl = document.getElementById('handhistory-entry')

hhv.injectStyle(hhv.css, document, 'hhv-hand-css')

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

function sortByDateTime (analyzed) {
  return analyzed.sort(byDateTime)
}

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

function render (h) {
  return hhv.render(h)
}

function isnull (x) { return !!x }

const historyTxt = handhistoryEl.textContent.trim()
const histories = hhp.extractHands(historyTxt)
const analyzed = histories.map(analyzeHistory).filter(isnull)
const sorted = sortByDateTime(analyzed)
const rendered = sorted.map(render).join('')
visualizedHandsEl.innerHTML = rendered

// hhv.filterPlayer({ filter: 'invested', who: 'held' })
hhv.filterPlayer({ filter: 'invested', who: 'held' })


},{"../hhv":8,"hha":1,"hhp":3}],8:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const injectStyle = require('./lib/inject-style')
const templates = require('./lib/templates')
const css       = templates.css
const filterCss = templates.filterCss
const head      = templates.head({ css: css })
const holdem    = templates.holdem

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
    s +=  shortenActionType(a.type) + ' '
        + (a.hasOwnProperty('ratio')
            ? oneDecimal(a.ratio)
            : '   ')
        + (a.allin ? ' A' : '')
        + ' '
  }
  return s.trim()
}

function renderPlayer (p) {
  return {
      pos      : (p.pos || '??').toUpperCase()
    , name     : p.name
    , cards    : renderCards(p.cards)
    , m        : p.m
    , preflop  : renderStreet(p.preflop, p.bb || p.sb)
    , flop     : renderStreet(p.flop, false)
    , turn     : renderStreet(p.turn, false)
    , river    : renderStreet(p.river, false)
    , showdown : renderStreet(p.showdown, false)
    , invested : p.invested
    , sawFlop  : p.sawFlop
  }
}

function ifTrue (key, obj, space, alternative, keyReplacement) {
  return obj[key] ? space + (keyReplacement || key) : alternative
}

function normalizeName (n) {
  return n.replace(/ /g, '_')
}

function renderInfo (i, players) {
  const info = {
      bb       : i.bb
    , sb       : i.sb
    , board    : i.board
    , year     : i.year
    , month    : i.month
    , day      : i.day
    , hour     : i.hour
    , min      : i.min
    , sec      : i.sec
    , gametype : i.gametype
    , gameno   : i.gameno
  }

  info.anyActivity =  ifTrue('anyInvested', i, ' ', '', 'any-invested')
                    + ifTrue('anySawFlop', i, ' ', '', 'any-sawFlop')

  info.playerActivity = ''
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    const name = normalizeName(p.name)
    info.playerActivity += (name + ' '
                        +   name + '-' + ifTrue('invested', p, '', 'notinvested') + ' '
                        +   name + '-' + ifTrue('sawFlop', p, '', 'notsawFlop') + ' ')
  }
  return info
}

exports.css       = css()
exports.filterCss = filterCss
exports.head      = head

exports.injectStyle = injectStyle

function getShows (opts, who) {
  let show
  let showHand
  if (opts.filter === 'invested') {
    show = 'invested'
    showHand = who + '-invested'
  } else if (opts.filter === 'sawFlop') {
    show = 'sawFlop'
    showHand = who + '-sawFlop'
  }
  return { show: show, showHand: showHand }
}
exports.filterPlayers = function filterPlayers (opts) {
  const shows = getShows(opts, 'any')
  injectStyle(filterCss(shows), document, 'players-filter')
}

exports.filterPlayer = function filterPlayer (opts) {
  const shows = getShows(opts, opts.who)
  injectStyle(filterCss(shows), document, 'player-filter')
}

exports.render = function render (analyzed) {
  const render = {
      info    : renderInfo(analyzed.info, analyzed.players)
    , table   : analyzed.table
    , board   : renderCards(analyzed.board)
    , players : analyzed.players.map(renderPlayer)
  }
  inspect(render)
  return holdem(render)
}

exports.pageify = function pageify (renderedHands) {
  const html =
      head
    + '<body>'
      + renderedHands
    + '</body>'
  return html
}

// Test
/* eslint-disable no-unused-vars */
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

},{"./lib/inject-style":11,"./lib/templates":9,"./test/fixtures/holdem/actiononall.json":42,"./test/fixtures/holdem/allin-preflop.json":43,"fs":12,"path":14,"util":17}],9:[function(require,module,exports){
/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const handlebars = require('hbsfy/runtime')
const helpers = require('./helpers')
helpers(handlebars)

exports.head      = require('../templates/head.hbs')
exports.css       = require('../templates/style.hbs')
exports.filterCss = require('../templates/style-filter.hbs')
exports.holdem    = require('../templates/holdem.hbs')

},{"../templates/head.hbs":38,"../templates/holdem.hbs":39,"../templates/style-filter.hbs":40,"../templates/style.hbs":41,"./helpers":10,"hbsfy/runtime":37}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{"_process":15}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],17:[function(require,module,exports){
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

},{"./support/isBuffer":16,"_process":15,"inherits":13}],18:[function(require,module,exports){
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


},{"./handlebars/base":19,"./handlebars/exception":22,"./handlebars/no-conflict":32,"./handlebars/runtime":33,"./handlebars/safe-string":34,"./handlebars/utils":35}],19:[function(require,module,exports){
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


},{"./decorators":20,"./exception":22,"./helpers":23,"./logger":31,"./utils":35}],20:[function(require,module,exports){
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


},{"./decorators/inline":21}],21:[function(require,module,exports){
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


},{"../utils":35}],22:[function(require,module,exports){
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


},{}],23:[function(require,module,exports){
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


},{"./helpers/block-helper-missing":24,"./helpers/each":25,"./helpers/helper-missing":26,"./helpers/if":27,"./helpers/log":28,"./helpers/lookup":29,"./helpers/with":30}],24:[function(require,module,exports){
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


},{"../utils":35}],25:[function(require,module,exports){
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


},{"../exception":22,"../utils":35}],26:[function(require,module,exports){
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


},{"../exception":22}],27:[function(require,module,exports){
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


},{"../utils":35}],28:[function(require,module,exports){
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


},{}],29:[function(require,module,exports){
'use strict';

exports.__esModule = true;

exports['default'] = function (instance) {
  instance.registerHelper('lookup', function (obj, field) {
    return obj && obj[field];
  });
};

module.exports = exports['default'];


},{}],30:[function(require,module,exports){
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


},{"../utils":35}],31:[function(require,module,exports){
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


},{"./utils":35}],32:[function(require,module,exports){
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

},{}],33:[function(require,module,exports){
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


},{"./base":19,"./exception":22,"./utils":35}],34:[function(require,module,exports){
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


},{}],35:[function(require,module,exports){
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


},{}],36:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime')['default'];

},{"./dist/cjs/handlebars.runtime":18}],37:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":36}],38:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper;

  return "<head>\n  <meta charset=\"utf-8\">\n  <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Inconsolata\">\n  <style type=\"text/css\">"
    + ((stack1 = ((helper = (helper = helpers.css || (depth0 != null ? depth0.css : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : {},{"name":"css","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</style>\n</head>\n";
},"useData":true});

},{"hbsfy/runtime":37}],39:[function(require,module,exports){
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
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card1 : stack1),{"name":"if","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card2 : stack1),{"name":"if","hash":{},"fn":container.program(6, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card3 : stack1),{"name":"if","hash":{},"fn":container.program(8, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card4 : stack1),{"name":"if","hash":{},"fn":container.program(10, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n      "
    + ((stack1 = helpers["if"].call(alias1,((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card5 : stack1),{"name":"if","hash":{},"fn":container.program(12, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\n";
},"4":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card1 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"6":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card2 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"8":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card3 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"10":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card4 : stack1), depth0)) != null ? stack1 : "")
    + " ";
},"12":function(container,depth0,helpers,partials,data) {
    var stack1;

  return " "
    + ((stack1 = container.lambda(((stack1 = (depth0 != null ? depth0.board : depth0)) != null ? stack1.card5 : stack1), depth0)) != null ? stack1 : "")
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

  return "      <tr\n        class=\"hhv-player "
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.invested : depth0),{"name":"if","hash":{},"fn":container.program(30, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.sawFlop : depth0),{"name":"if","hash":{},"fn":container.program(32, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "\"\n      >\n        <td>"
    + alias4(((helper = (helper = helpers.pos || (depth0 != null ? depth0.pos : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"pos","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + ((stack1 = alias5(((stack1 = (depth0 != null ? depth0.cards : depth0)) != null ? stack1.card1 : stack1), depth0)) != null ? stack1 : "")
    + ((stack1 = alias5(((stack1 = (depth0 != null ? depth0.cards : depth0)) != null ? stack1.card2 : stack1), depth0)) != null ? stack1 : "")
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
},"30":function(container,depth0,helpers,partials,data) {
    return " invested";
},"32":function(container,depth0,helpers,partials,data) {
    return " sawFlop";
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
    + ((stack1 = helpers["if"].call(alias3,(depth0 != null ? depth0.board : depth0),{"name":"if","hash":{},"fn":container.program(3, data, 0),"inverse":container.program(14, data, 0),"data":data})) != null ? stack1 : "")
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
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.players : depth0),{"name":"each","hash":{},"fn":container.program(29, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "      </tbody>\n    </table>\n  </div>\n</div>\n";
},"useData":true});

},{"hbsfy/runtime":37}],40:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"1":function(container,depth0,helpers,partials,data) {
    return ".hhv-player {\n  display: table-row;\n}\n";
},"3":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : {}, alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "\n.hhv-player {\n  display: none;\n}\n.hhv-player."
    + alias4(((helper = (helper = helpers.show || (depth0 != null ? depth0.show : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"show","hash":{},"data":data}) : helper)))
    + " {\n  display: table-row;\n}\n\n.hhv-hand {\n  display: none;\n}\n.hhv-hand."
    + alias4(((helper = (helper = helpers.showHand || (depth0 != null ? depth0.showHand : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"showHand","hash":{},"data":data}) : helper)))
    + " {\n  display: block;\n}\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return ((stack1 = helpers["if"].call(depth0 != null ? depth0 : {},(depth0 != null ? depth0.showall : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.program(3, data, 0),"data":data})) != null ? stack1 : "");
},"useData":true});

},{"hbsfy/runtime":37}],41:[function(require,module,exports){
// hbsfy compiled Handlebars template
var HandlebarsCompiler = require('hbsfy/runtime');
module.exports = HandlebarsCompiler.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return ".hhv-hand {\n  width: 700px;\n  background: #333;\n  border: 1px solid #333;\n  border-radius: 6px 6px 0 0;\n  box-shadow: 6px 6px 12px #888;\n  margin: 0 0 10px 0;\n}\n.hhv-header {\n  color: yellowgreen;\n  height: 20px;\n  padding: 2px;\n  font-family: monospace;\n}\n.hhv-board {\n  background: antiquewhite;\n  border-radius: 3px;\n  height: 20px;\n  color: black;\n  padding: 1px 0px 1px 2px;\n  margin-right: 3px;\n  min-width: 60px;\n}\n.hhv-card-value,\n.hhv-card-suit {\n  font-family: verdana;\n  font-size: 13px;\n}\n.hhv-card-suit {\n  margin-right: 2px;\n  font-size: 15px;\n}\n.hhv-card-suit.s,\n.hhv-card-suit.c {\n  color: black;\n}\n.hhv-card-suit.d,\n.hhv-card-suit.h {\n  color: red;\n}\n.hhv-table {\n  background: white;\n  font-family: Inconsolata, monospace;\n}\n\n.hhv-table th {\n  text-align: left;\n  font-size: 13px;\n}\n\n.hhv-table td {\n  text-align: left;\n  padding: 0px 4px 0px 4px;\n  white-space: pre;\n  font-size: 13px;\n}\n.hhv-table .hhv-card-value,\n.hhv-table .hhv-card-suit {\n  font-size: 13px;\n}\n\n.hhv-table td:nth-child(1) { width: 10px; }\n.hhv-table td:nth-child(2) { width: 100px; }\n.hhv-table td:nth-child(3) { width: 30px; }\n.hhv-table td:nth-child(4) { width: 10px; text-align: right;}\n.hhv-table td:nth-child(5) { width: 100px; }\n.hhv-table td:nth-child(6) { width: 100px; }\n.hhv-table td:nth-child(7) { width: 100px; }\n.hhv-table td:nth-child(8) { width: 100px; }\n";
},"useData":true});

},{"hbsfy/runtime":37}],42:[function(require,module,exports){
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
},{}],43:[function(require,module,exports){
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
},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9oaGEvbm9kZV9tb2R1bGVzL2hoYS9oaGEuanMiLCIuLi9oaGEvbGliL2hvbGRlbS5qcyIsIi4uL2hocC9ub2RlX21vZHVsZXMvaGhwL2hocC5qcyIsIi4uL2hocC9saWIvaG9sZGVtL2Jhc2UuanMiLCIuLi9oaHAvbGliL2hvbGRlbS9wb2tlcnN0YXJzLmpzIiwiLi4vaGhwL2xpYi91dGlsL3N0cmluZy5qcyIsImNsaWVudC9tYWluLmpzIiwiaGh2LmpzIiwibGliL2Jyb3dzZXItdGVtcGxhdGVzLmpzIiwibGliL2hlbHBlcnMuanMiLCJsaWIvaW5qZWN0LXN0eWxlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy5ydW50aW1lLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvYmFzZS5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2RlY29yYXRvcnMuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9kZWNvcmF0b3JzL2lubGluZS5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2V4Y2VwdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2Jsb2NrLWhlbHBlci1taXNzaW5nLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9lYWNoLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy9oZWxwZXItbWlzc2luZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvaWYuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9oZWxwZXJzL2xvZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL2hlbHBlcnMvbG9va3VwLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvaGVscGVycy93aXRoLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvbGliL2hhbmRsZWJhcnMvbG9nZ2VyLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvZGlzdC9janMvaGFuZGxlYmFycy9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9uby1jb25mbGljdC5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL3J1bnRpbWUuanMiLCJub2RlX21vZHVsZXMvaGFuZGxlYmFycy9saWIvaGFuZGxlYmFycy9zYWZlLXN0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2xpYi9oYW5kbGViYXJzL3V0aWxzLmpzIiwibm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIm5vZGVfbW9kdWxlcy9oYnNmeS9ydW50aW1lLmpzIiwidGVtcGxhdGVzL2hlYWQuaGJzIiwidGVtcGxhdGVzL2hvbGRlbS5oYnMiLCJ0ZW1wbGF0ZXMvc3R5bGUtZmlsdGVyLmhicyIsInRlbXBsYXRlcy9zdHlsZS5oYnMiLCJ0ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uIiwidGVzdC9maXh0dXJlcy9ob2xkZW0vYWxsaW4tcHJlZmxvcC5qc29uIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxV0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBhbmFseXplSG9sZGVtID0gcmVxdWlyZSgnLi9saWIvaG9sZGVtJylcblxuLyoqXG4gKiBBbmFseXplcyBhIGdpdmVuIFBva2VySGFuZCB3aGljaCBoYXMgYmVlbiBwYXJzZWQgYnkgdGhlIEhhbmRIaXN0b3J5IFBhcnNlciBoaHAuXG4gKiBSZWxhdGl2ZSBwbGF5ZXIgcG9zaXRpb25zIGFyZSBjYWxjdWxhdGVkLCBpLmUuIGN1dG9mZiwgYnV0dG9uLCBldGMuXG4gKiBQbGF5ZXJzIGFyZSBpbmNsdWRlZCBpbiBvcmRlciBvZiBhY3Rpb24gb24gZmxvcC5cbiAqXG4gKiBUaGUgYW5hbHl6ZWQgaGFuZCB0aGVuIGNhbiBiZSB2aXN1YWxpemVkIGJ5IFtoaHZdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaHYpLlxuICpcbiAqIEZvciBhbiBleGFtcGxlIG9mIGFuIGFuYWx5emVkIGhhbmQgcGxlYXNlIHZpZXcgW2pzb24gb3V0cHV0IG9mIGFuIGFuYWx5emVkXG4gKiBoYW5kXShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGh2L2Jsb2IvbWFzdGVyL3Rlc3QvZml4dHVyZXMvaG9sZGVtL2FjdGlvbm9uYWxsLmpzb24pLlxuICpcbiAqIEBuYW1lIGFuYWx5emVcbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtvYmplY3R9IGhhbmQgaGFuZCBoaXN0b3J5IGFzIHBhcnNlZCBieSBbaGhwXShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGhwKVxuICogQHJldHVybiB7b2JqZWN0fSB0aGUgYW5hbHl6ZWQgaGFuZFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFuYWx5emUgKGhhbmQpIHtcbiAgaWYgKCFoYW5kLmluZm8pIHRocm93IG5ldyBFcnJvcignSGFuZCBpcyBtaXNzaW5nIGluZm8nKVxuICBpZiAoaGFuZC5pbmZvLnBva2VydHlwZSA9PT0gJ2hvbGRlbScpIHJldHVybiBhbmFseXplSG9sZGVtKGhhbmQpXG59XG5cbi8vIFRlc3RcbmZ1bmN0aW9uIGluc3BlY3QgKG9iaiwgZGVwdGgpIHtcbiAgY29uc29sZS5lcnJvcihyZXF1aXJlKCd1dGlsJykuaW5zcGVjdChvYmosIGZhbHNlLCBkZXB0aCB8fCA1LCB0cnVlKSlcbn1cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJylcbiAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxuICBjb25zdCBoaHZfZml4dHVyZXMgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4nLCAnaGh2JywgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaG9sZGVtJylcblxuICAvLyBjb25zdCBuYW1lID0gJ2FjdGlvbm9uYWxsJ1xuICBjb25zdCBuYW1lID0gJ2FsbGluLXByZWZsb3AnXG5cbiAgY29uc3QgaGFuZCA9IHJlcXVpcmUoJy4vdGVzdC9maXh0dXJlcy9ob2xkZW0vJyArIG5hbWUgKyAnLmpzb24nKVxuICBjb25zdCBhbmFseXplZCA9IG1vZHVsZS5leHBvcnRzKGhhbmQpXG5cbiAgaW5zcGVjdChhbmFseXplZClcblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihoaHZfZml4dHVyZXMsIG5hbWUgKyAnLmpzb24nKSxcbiAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShhbmFseXplZCwgbnVsbCwgMiksXG4gICAgICAgICAgICAgICAgICAgJ3V0ZjgnKVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuY29uc3QgY2FyZE9yZGVyID0gWyAnMicsICczJywgJzQnLCAnNScsICc2JywgJzcnLCAnOCcsICdUJywgJ0onLCAnUScsICdLJywgJ0EnIF1cblxuZnVuY3Rpb24gcm91bmQgKG4pIHtcbiAgcmV0dXJuIE1hdGgucm91bmQobiAqIDEwKSAvIDEwXG59XG5cbmZ1bmN0aW9uIG5vdG1ldGFkYXRhIChrKSB7XG4gIHJldHVybiBrICE9PSAnbWV0YWRhdGEnXG59XG5cbmZ1bmN0aW9uIGNvcHlWYWx1ZXMgKG8pIHtcbiAgZnVuY3Rpb24gY29weSAoYWNjLCBrKSB7XG4gICAgYWNjW2tdID0gb1trXVxuICAgIHJldHVybiBhY2NcbiAgfVxuICBpZiAoIW8pIHJldHVybiBvXG4gIHJldHVybiBPYmplY3Qua2V5cyhvKVxuICAgIC5maWx0ZXIobm90bWV0YWRhdGEpXG4gICAgLnJlZHVjZShjb3B5LCB7fSlcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSG9sZUNhcmRzIChoYykge1xuICBpZiAoIWhjKSByZXR1cm4gaGNcbiAgY29uc3QgYzEgPSBoYy5jYXJkMVxuICBjb25zdCBjMiA9IGhjLmNhcmQyXG4gIGlmICghYzEgfHwgIWMyKSByZXR1cm4gaGNcbiAgLy8gc2hvdyBsYXJnZSBjYXJkIGJlZm9yZSBzbWFsbGVyIGNhcmRcbiAgcmV0dXJuIGNhcmRPcmRlci5pbmRleE9mKGMxWzBdKSA8IGNhcmRPcmRlci5pbmRleE9mKGMyWzBdKVxuICAgID8geyBjYXJkMTogYzIsIGNhcmQyOiBjMSB9IDogeyBjYXJkMTogYzEsIGNhcmQyOiBjMiB9XG59XG5cbmZ1bmN0aW9uIGdldFN0YXJ0aW5nUG90IChvLCBwbGF5ZXJDb3VudCkge1xuICBjb25zdCB0b3RhbEFudGUgPSAoby5hbnRlIHx8IDApICogcGxheWVyQ291bnRcbiAgcmV0dXJuICAoby5zYiB8fCAwKSArIChvLmJiIHx8IDApICsgdG90YWxBbnRlXG59XG5cbmZ1bmN0aW9uIHBvc3RGbG9wT3JkZXJGcm9tUHJlZmxvcE9yZGVyIChuLCBwbGF5ZXJDb3VudCkge1xuICAvLyBoZWFkc3VwIGp1c3QgcmV2ZXJzZXMgdGhlIG9yZGVyXG4gIGlmIChwbGF5ZXJDb3VudCA9PT0gMikgcmV0dXJuIG4gPT09IDAgPyAxIDogMFxuXG4gIGlmIChuID09PSAocGxheWVyQ291bnQgLSAxKSkgcmV0dXJuIDEgLy8gQkJcbiAgaWYgKG4gPT09IChwbGF5ZXJDb3VudCAtIDIpKSByZXR1cm4gMCAvLyBTQlxuICByZXR1cm4gbiArIDJcbn1cblxuZnVuY3Rpb24gc3RyYXRlZ2ljUG9zaXRpb25Gcm9tUG9zdEZsb3BPcmRlciAobiwgcGxheWVyQ291bnQpIHtcbiAgLy8gbiBpcyBwb3NpdGlvbiBpbiB3aGljaCBwbGF5ZXIgJ3dvdWxkIGhhdmUnIGFjdGVkIG9uIGZsb3AgYW5kIGFmdGVyXG4gIC8vICd3b3VsZCBoYXZlJyBiZWNhdXNlIGhlIG1heSBoYXZlIGZvbGRlZCBwcmVmbG9wIDspXG5cbiAgLy8gaGVhZHN1cFxuICBpZiAocGxheWVyQ291bnQgPT09IDIpIHtcbiAgICBpZiAobiA9PT0gMCkgcmV0dXJuICdiYidcbiAgICBpZiAobiA9PT0gMSkgcmV0dXJuICdzYidcbiAgfVxuXG4gIC8vIG5vIGhlYWRzdXBcblxuICAvLyBibGluZHNcbiAgaWYgKG4gPT09IDApIHJldHVybiAnc2InXG4gIGlmIChuID09PSAxKSByZXR1cm4gJ2JiJ1xuXG4gIC8vIG90aGVyc2tcbiAgc3dpdGNoIChwbGF5ZXJDb3VudCAtIG4pIHtcbiAgICBjYXNlIDE6IHJldHVybiAnYnUnXG4gICAgY2FzZSAyOiByZXR1cm4gJ2NvJ1xuICAgIGNhc2UgMzogcmV0dXJuICdsdCdcbiAgICBjYXNlIDQ6XG4gICAgY2FzZSA1OlxuICAgICAgcmV0dXJuICdtaSdcbiAgICBjYXNlIDY6XG4gICAgY2FzZSA3OlxuICAgIGNhc2UgODpcbiAgICAgIHJldHVybiAnZWEnXG4gIH1cbn1cblxuZnVuY3Rpb24gYnlQb3N0RmxvcE9yZGVyIChwMSwgcDIpIHtcbiAgcmV0dXJuIHAxLnBvc3RmbG9wT3JkZXIgLSBwMi5wb3N0ZmxvcE9yZGVyXG59XG5cbmZ1bmN0aW9uIHNvcnRQbGF5ZXJzQnlQb3N0RmxvcE9yZGVyIChwbGF5ZXJzKSB7XG4gIGZ1bmN0aW9uIGFwcGVuZFBsYXllciAoYWNjLCBrKSB7XG4gICAgY29uc3QgcCA9IHBsYXllcnNba11cbiAgICBwLm5hbWUgPSBrXG4gICAgYWNjLnB1c2gocClcbiAgICByZXR1cm4gYWNjXG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKHBsYXllcnMpXG4gICAgLnJlZHVjZShhcHBlbmRQbGF5ZXIsIFtdKVxuICAgIC5zb3J0KGJ5UG9zdEZsb3BPcmRlcilcbn1cblxuZnVuY3Rpb24gcGxheWVySW52ZXN0ZWQgKHByZWZsb3ApIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwcmVmbG9wLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYWN0aW9uID0gcHJlZmxvcFtpXS50eXBlXG4gICAgaWYgKGFjdGlvbiA9PT0gJ2JldCcgfHwgYWN0aW9uID09PSAnY2FsbCcgfHwgYWN0aW9uID09PSAncmFpc2UnKSByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBwbGF5ZXJTYXdTaG93ZG93biAocCkge1xuICBpZiAocC5zaG93ZG93bi5sZW5ndGgpIHJldHVybiB0cnVlXG4gIGlmIChwLnJpdmVyLmxlbmd0aCAmJiBwLnJpdmVyW3Aucml2ZXIubGVuZ3RoIC0gMV0udHlwZSAhPT0gJ2ZvbGQnKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gYWRkQWN0aXZpdHlJbmZvIChwbGF5ZXJzLCBpbmZvKSB7XG4gIGxldCBhbnlJbnZlc3RlZCAgICA9IGZhbHNlXG4gIGxldCBhbnlTYXdGbG9wICAgICA9IGZhbHNlXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBsYXllciAgICAgICA9IHBsYXllcnNbaV1cbiAgICBwbGF5ZXIuaW52ZXN0ZWQgICAgPSBwbGF5ZXIuc2IgfHwgcGxheWVyLmJiIHx8IHBsYXllckludmVzdGVkKHBsYXllci5wcmVmbG9wKVxuICAgIHBsYXllci5zYXdGbG9wICAgICA9ICEhcGxheWVyLmZsb3AubGVuZ3RoXG5cbiAgICBpZiAoIWFueUludmVzdGVkKSBhbnlJbnZlc3RlZCA9IHBsYXllci5pbnZlc3RlZFxuICAgIGlmICghYW55U2F3RmxvcCkgYW55U2F3RmxvcCAgID0gcGxheWVyLnNhd0Zsb3BcbiAgfVxuXG4gIGluZm8uYW55SW52ZXN0ZWQgICAgPSBhbnlJbnZlc3RlZFxuICBpbmZvLmFueVNhd0Zsb3AgICAgID0gYW55U2F3RmxvcFxufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGlwcyAocHJldiwgY3VycmVudCwgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKSB7XG4gIE9iamVjdC5rZXlzKHBsYXllcnMpXG4gICAgLmZvckVhY2godXBkYXRlUGxheWVyQ2hpcHMsIHsgcHJldjogcHJldiwgY3VycmVudDogY3VycmVudCB9KVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVBsYXllckNoaXBzIChrKSB7XG4gICAgY29uc3QgcCA9IHBsYXllcnNba11cbiAgICBsZXQgY2hpcHMgPSBwW3RoaXMucHJldl0gLSAoaW52ZXN0ZWRzW2tdIHx8IDApXG4gICAgaWYgKHRoaXMucHJldiA9PT0gJ2NoaXBzUHJlZmxvcCcpIHtcbiAgICAgIGlmIChwLmJiKSBjaGlwcyArPSBoYW5kLmluZm8uYmJcbiAgICAgIGlmIChwLnNiKSBjaGlwcyArPSBoYW5kLmluZm8uc2JcbiAgICB9XG4gICAgcC5jaGlwc0FmdGVyID0gcFt0aGlzLmN1cnJlbnRdID0gY2hpcHNcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFuYWx5emVIb2xkZW0gKGhhbmQpIHtcbiAgbGV0IHBvdCA9IDBcbiAgbGV0IGN1cnJlbnRCZXQgPSBoYW5kLmluZm8uYmJcblxuICBjb25zdCBwbGF5ZXJDb3VudCA9IGhhbmQuc2VhdHMubGVuZ3RoXG4gIGNvbnN0IHN0YXJ0aW5nUG90ID0gZ2V0U3RhcnRpbmdQb3QoaGFuZC5pbmZvLCBwbGF5ZXJDb3VudClcblxuICBjb25zdCBwbGF5ZXJzID0ge31cbiAgY29uc3QgYW5hbHl6ZWQgPSB7XG4gICAgICBpbmZvICAgIDogY29weVZhbHVlcyhoYW5kLmluZm8pXG4gICAgLCB0YWJsZSAgIDogY29weVZhbHVlcyhoYW5kLnRhYmxlKVxuICAgICwgYm9hcmQgICA6IGNvcHlWYWx1ZXMoaGFuZC5ib2FyZClcbiAgfVxuICBhbmFseXplZC5pbmZvLnBsYXllcnMgPSBwbGF5ZXJDb3VudFxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVyQ291bnQ7IGkrKykge1xuICAgIGNvbnN0IHMgPSBoYW5kLnNlYXRzW2ldXG4gICAgY29uc3QgcGxheWVyID0ge1xuICAgICAgICBzZWF0bm8gICAgICAgIDogcy5zZWF0bm9cbiAgICAgICwgY2hpcHMgICAgICAgICA6IHMuY2hpcHNcbiAgICAgICwgY2hpcHNQcmVmbG9wICA6IHMuY2hpcHNcbiAgICAgICwgY2hpcHNGbG9wICAgICA6IE5hTlxuICAgICAgLCBjaGlwc1R1cm4gICAgIDogTmFOXG4gICAgICAsIGNoaXBzUml2ZXIgICAgOiBOYU5cbiAgICAgICwgY2hpcHNTaG93ZG93biA6IE5hTlxuICAgICAgLCBjaGlwc0FmdGVyICAgIDogTmFOXG4gICAgICAsIG0gICAgICAgICAgICAgOiBNYXRoLnJvdW5kKHMuY2hpcHMgLyBzdGFydGluZ1BvdClcbiAgICAgICwgcHJlZmxvcCAgICAgICA6IFtdXG4gICAgICAsIGZsb3AgICAgICAgICAgOiBbXVxuICAgICAgLCB0dXJuICAgICAgICAgIDogW11cbiAgICAgICwgcml2ZXIgICAgICAgICA6IFtdXG4gICAgICAsIHNob3dkb3duICAgICAgOiBbXVxuICAgIH1cbiAgICBpZiAoaGFuZC50YWJsZS5idXR0b24gPT09IHMuc2VhdG5vKSBwbGF5ZXIuYnV0dG9uID0gdHJ1ZVxuICAgIGlmIChoYW5kLmhlcm8gPT09IHMucGxheWVyKSB7XG4gICAgICBwbGF5ZXIuaGVybyA9IHRydWVcbiAgICAgIGlmIChoYW5kLmhvbGVjYXJkcykge1xuICAgICAgICBwbGF5ZXIuY2FyZHMgPSBub3JtYWxpemVIb2xlQ2FyZHMoaGFuZC5ob2xlY2FyZHMpXG4gICAgICB9XG4gICAgfVxuICAgIHBsYXllcnNbcy5wbGF5ZXJdID0gcGxheWVyXG4gIH1cbiAgYW5hbHl6ZWQucGxheWVycyA9IHBsYXllcnNcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGhhbmQucG9zdHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5wb3N0c1tpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgcG90ICs9IHAuYW1vdW50XG4gICAgcGxheWVyLmNoaXBzQWZ0ZXIgPSBwbGF5ZXIuY2hpcHNQcmVmbG9wIC09IHAuYW1vdW50XG5cbiAgICBpZiAocC50eXBlID09PSAnc2InKSBwbGF5ZXIuc2IgPSB0cnVlXG4gICAgaWYgKHAudHlwZSA9PT0gJ2JiJykgcGxheWVyLmJiID0gdHJ1ZVxuICB9XG5cbiAgZnVuY3Rpb24gYW5hbHl6ZUFjdGlvbiAocCwgaW52ZXN0ZWQpIHtcbiAgICBjb25zdCBzdGFydGluZ1BvdCA9IHBvdFxuICAgIGxldCBjb3N0ID0gMFxuICAgIGNvbnN0IGFjdGlvbiA9IHtcbiAgICAgICAgdHlwZTogcC50eXBlXG4gICAgfVxuICAgIGlmIChwLnR5cGUgPT09ICdyYWlzZScpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAucmFpc2VUbyAvIGN1cnJlbnRCZXQpXG4gICAgICBhY3Rpb24uYWxsaW4gPSAhIXAuYWxsaW5cbiAgICAgIGFjdGlvbi5hbW91bnQgPSBwLnJhaXNlVG8gLSBpbnZlc3RlZFxuICAgICAgY3VycmVudEJldCA9IHAucmFpc2VUb1xuICAgICAgcG90ICs9IGN1cnJlbnRCZXRcbiAgICAgIGNvc3QgPSBhY3Rpb24uYW1vdW50XG4gICAgfSBlbHNlIGlmIChwLnR5cGUgPT09ICdiZXQnKSB7XG4gICAgICBhY3Rpb24ucmF0aW8gPSByb3VuZChwLmFtb3VudCAvIHBvdClcbiAgICAgIGFjdGlvbi5hbGxpbiA9ICEhcC5hbGxpblxuICAgICAgYWN0aW9uLmFtb3VudCA9IHAuYW1vdW50XG4gICAgICBjdXJyZW50QmV0ID0gcC5hbW91bnRcbiAgICAgIHBvdCArPSBjdXJyZW50QmV0XG4gICAgICBjb3N0ID0gYWN0aW9uLmFtb3VudFxuICAgIH0gZWxzZSBpZiAocC50eXBlID09PSAnY2FsbCcpIHtcbiAgICAgIGFjdGlvbi5yYXRpbyA9IHJvdW5kKHAuYW1vdW50IC8gcG90KVxuICAgICAgYWN0aW9uLmFsbGluID0gISFwLmFsbGluXG4gICAgICBhY3Rpb24uYW1vdW50ID0gcC5hbW91bnRcbiAgICAgIHBvdCArPSBwLmFtb3VudFxuICAgICAgY29zdCA9IGFjdGlvbi5hbW91bnRcbiAgICB9XG4gICAgYWN0aW9uLnBvdCA9IHN0YXJ0aW5nUG90XG4gICAgcmV0dXJuIHsgYWN0aW9uOiBhY3Rpb24sIGNvc3Q6IGNvc3QgfHwgMCB9XG4gIH1cblxuICBsZXQgaW52ZXN0ZWRzID0ge31cblxuICBmdW5jdGlvbiBzdGFydFByZWZsb3BDb3N0IChwKSB7XG4gICAgaWYgKHAuYmIpIHJldHVybiBoYW5kLmluZm8uYmJcbiAgICBpZiAocC5zYikgcmV0dXJuIGhhbmQuaW5mby5zYlxuICAgIHJldHVybiAwXG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGhhbmQucHJlZmxvcC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBoYW5kLnByZWZsb3BbaV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIGNvbnN0IGludmVzdGVkID0gaW52ZXN0ZWRzW3AucGxheWVyXSB8fCBzdGFydFByZWZsb3BDb3N0KHBsYXllcilcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBwbGF5ZXIucHJlZmxvcC5wdXNoKGluZm8uYWN0aW9uKVxuICAgIGlmICghcGxheWVyLmhhc093blByb3BlcnR5KCdwcmVmbG9wT3JkZXInKSkge1xuICAgICAgcGxheWVyLnByZWZsb3BPcmRlciA9IGlcbiAgICAgIHBsYXllci5wb3N0ZmxvcE9yZGVyID0gcG9zdEZsb3BPcmRlckZyb21QcmVmbG9wT3JkZXIoaSwgcGxheWVyQ291bnQpXG4gICAgICBwbGF5ZXIucG9zID0gc3RyYXRlZ2ljUG9zaXRpb25Gcm9tUG9zdEZsb3BPcmRlcihwbGF5ZXIucG9zdGZsb3BPcmRlciwgcGxheWVyQ291bnQpXG4gICAgfVxuICAgIGludmVzdGVkc1twLnBsYXllcl0gPSBpbnZlc3RlZCArIGluZm8uY29zdFxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc1ByZWZsb3AnLCAnY2hpcHNGbG9wJywgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKVxuXG4gIGludmVzdGVkcyA9IHt9XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZC5mbG9wLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQuZmxvcFtpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgY29uc3QgaW52ZXN0ZWQgPSBpbnZlc3RlZHNbcC5wbGF5ZXJdIHx8IDBcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBwbGF5ZXIuZmxvcC5wdXNoKGluZm8uYWN0aW9uKVxuICAgIGludmVzdGVkc1twLnBsYXllcl0gPSBpbnZlc3RlZCArIGluZm8uY29zdFxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc0Zsb3AnLCAnY2hpcHNUdXJuJywgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKVxuXG4gIGludmVzdGVkcyA9IHt9XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZC50dXJuLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQudHVybltpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgY29uc3QgaW52ZXN0ZWQgPSBpbnZlc3RlZHNbcC5wbGF5ZXJdIHx8IDBcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBwbGF5ZXIudHVybi5wdXNoKGluZm8uYWN0aW9uKVxuICAgIGludmVzdGVkc1twLnBsYXllcl0gPSBpbnZlc3RlZCArIGluZm8uY29zdFxuICB9XG4gIHVwZGF0ZUNoaXBzKCdjaGlwc1R1cm4nLCAnY2hpcHNSaXZlcicsIGludmVzdGVkcywgcGxheWVycywgaGFuZClcblxuICBpbnZlc3RlZHMgPSB7fVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGhhbmQucml2ZXIubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwID0gaGFuZC5yaXZlcltpXVxuICAgIGNvbnN0IHBsYXllciA9IHBsYXllcnNbcC5wbGF5ZXJdXG4gICAgY29uc3QgaW52ZXN0ZWQgPSBpbnZlc3RlZHNbcC5wbGF5ZXJdIHx8IDBcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUFjdGlvbihwLCBpbnZlc3RlZClcbiAgICBwbGF5ZXIucml2ZXIucHVzaChpbmZvLmFjdGlvbilcbiAgICBpbnZlc3RlZHNbcC5wbGF5ZXJdID0gaW52ZXN0ZWQgKyBpbmZvLmNvc3RcbiAgfVxuICB1cGRhdGVDaGlwcygnY2hpcHNSaXZlcicsICdjaGlwc1Nob3dkb3duJywgaW52ZXN0ZWRzLCBwbGF5ZXJzLCBoYW5kKVxuXG4gIC8vIGZpcnN0IHdlIGFnZ3JlZ2F0ZSBhbGwgY29sbGVjdGlvbnMgYW5kIHRoZW4gY29uZGVuc2UgaW50byBvbmUgYWN0aW9uXG4gIGxldCBjb2xsZWN0ZWRzID0ge31cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoYW5kLnNob3dkb3duLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcCA9IGhhbmQuc2hvd2Rvd25baV1cbiAgICBjb25zdCBwbGF5ZXIgPSBwbGF5ZXJzW3AucGxheWVyXVxuICAgIGlmIChwLnR5cGUgPT09ICdzaG93JyB8fCBwLnR5cGUgPT09ICdtdWNrJykge1xuICAgICAgcGxheWVyLmNhcmRzID0gbm9ybWFsaXplSG9sZUNhcmRzKHsgY2FyZDE6IHAuY2FyZDEsIGNhcmQyOiBwLmNhcmQyIH0pXG4gICAgfSBlbHNlIGlmIChwLnR5cGUgPT09ICdjb2xsZWN0Jykge1xuICAgICAgY29sbGVjdGVkc1twLnBsYXllcl0gPSAoY29sbGVjdGVkc1twLnBsYXllcl0gfHwgMCkgKyBwLmFtb3VudFxuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbGxlY3RlZHMpLmZvckVhY2gocHJvY2Vzc0NvbGxlY3RlZHMpXG4gIGZ1bmN0aW9uIHByb2Nlc3NDb2xsZWN0ZWRzIChrKSB7XG4gICAgY29uc3QgcGxheWVyID0gcGxheWVyc1trXVxuICAgIGNvbnN0IGFtb3VudCA9IGNvbGxlY3RlZHNba11cbiAgICBjb25zdCByYXRpbyA9IHJvdW5kKGFtb3VudCAvIHBvdClcbiAgICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICAgIHR5cGUgICA6ICdjb2xsZWN0J1xuICAgICAgLCByYXRpbyAgOiByYXRpb1xuICAgICAgLCB3aW5hbGwgOiByYXRpbyA9PT0gMVxuICAgICAgLCBhbW91bnQgOiBhbW91bnRcbiAgICB9XG4gICAgcGxheWVyLnNob3dkb3duLnB1c2goYWN0aW9uKVxuICAgIHBsYXllci5jaGlwc0FmdGVyICs9IGFtb3VudFxuICB9XG5cbiAgYW5hbHl6ZWQucGxheWVycyA9IHNvcnRQbGF5ZXJzQnlQb3N0RmxvcE9yZGVyKHBsYXllcnMpXG4gIGFkZEFjdGl2aXR5SW5mbyhhbmFseXplZC5wbGF5ZXJzLCBhbmFseXplZC5pbmZvKVxuICByZXR1cm4gYW5hbHl6ZWRcbn1cbiIsIi8qIGVzbGludC1kaXNhYmxlIGNvbW1hLXN0eWxlLCBvcGVyYXRvci1saW5lYnJlYWssIHNwYWNlLXVuYXJ5LW9wcywgbm8tbXVsdGktc3BhY2VzLCBrZXktc3BhY2luZywgaW5kZW50ICovXG4ndXNlIHN0cmljdCdcblxuY29uc3Qgc3RyaW5nVXRpbCA9IHJlcXVpcmUoJy4vbGliL3V0aWwvc3RyaW5nJylcblxuY29uc3QgaG9sZGVtX3BzID0gcmVxdWlyZSgnLi9saWIvaG9sZGVtL3Bva2Vyc3RhcnMnKVxuXG5mdW5jdGlvbiBnZXRMaW5lcyAodHh0KSB7XG4gIGNvbnN0IHRyaW1tZWQgPSB0eHQuc3BsaXQoJ1xcbicpLm1hcChzdHJpbmdVdGlsLnRyaW1MaW5lKVxuICB3aGlsZSAodHJpbW1lZFswXSAmJiAhdHJpbW1lZFswXS5sZW5ndGgpIHRyaW1tZWQuc2hpZnQoKVxuICByZXR1cm4gdHJpbW1lZFxufVxuXG4vKipcbiAqIFBhcnNlcyBQb2tlckhhbmQgSGlzdG9yaWVzIGFzIG91dHB1dCBieSB0aGUgZ2l2ZW4gb25saW5lIFBva2VyIFJvb21zLlxuICogQXV0b2RldGVjdHMgdGhlIGdhbWUgdHlwZSBhbmQgdGhlIFBva2VyUm9vbS5cbiAqIFNvIGZhciBQb2tlclN0YXJzIEhvbGRlbSBoYW5kcyBhcmUgc3VwcG9ydGVkLlxuICpcbiAqIFRoZSBwYXJzZWQgaGFuZHMgY2FuIHRoZW4gYmUgZnVydGhlciBhbmFseXplZCB3aXRoIHRoZVxuICogW2hoYV0oaHR0cHM6Ly9naXRodWIuY29tL3RobG9yZW56L2hoYSkgbW9kdWxlLlxuICpcbiAqIEFzIGFuIGV4YW1wbGUgW3RoaXNcbiAqIGhhbmRdKGh0dHBzOi8vZ2l0aHViLmNvbS90aGxvcmVuei9oaHAvYmxvYi9tYXN0ZXIvdGVzdC9maXh0dXJlcy9ob2xkZW0vcG9rZXJzdGFycy9hY3Rpb25vbmFsbC50eHQpXG4gKiBpcyBwYXJzZWQgaW50byBbdGhpcyBvYmplY3RcbiAqIHJlcHJlc2VudGF0aW9uXShodHRwczovL2dpdGh1Yi5jb20vdGhsb3JlbnovaGhhL2Jsb2IvbWFzdGVyL3Rlc3QvZml4dHVyZXMvaG9sZGVtL2FjdGlvbm9uYWxsLmpzb24pLlxuICpcbiAqIEBuYW1lIHBhcnNlXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7c3RyaW5nfSBpbnB1dCB0aGUgdGV4dHVhbCByZXByZXNlbnRhdGlvbiBvZiBvbmUgcG9rZXIgaGFuZCBhcyB3cml0dGVuIHRvIHRoZSBIYW5kSGlzdG9yeSBmb2xkZXJcbiAqIEByZXR1cm4ge29iamVjdH0gcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGhhbmQgdG8gYmUgdXNlZCBhcyBpbnB1dCBmb3Igb3RoZXIgdG9vbHMgbGlrZSBoaGFcbiAqL1xuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2UgKGlucHV0KSB7XG4gIGNvbnN0IGxpbmVzID0gQXJyYXkuaXNBcnJheShpbnB1dCkgPyBpbnB1dCA6IGdldExpbmVzKGlucHV0KS5maWx0ZXIoc3RyaW5nVXRpbC5lbXB0eUxpbmUpXG4gIGlmIChob2xkZW1fcHMuY2FuUGFyc2UobGluZXMpKSByZXR1cm4gaG9sZGVtX3BzLnBhcnNlKGxpbmVzKVxufVxuXG4vKipcbiAqIEV4dHJhY3RzIGFsbCBoYW5kcyBmcm9tIGEgZ2l2ZW4gdGV4dCBmaWxlLlxuICpcbiAqIEBuYW1lIGV4dHJhY3RIYW5kc1xuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gdHh0IHRoZSB0ZXh0IGNvbnRhaW5pbmcgdGhlIGhhbmRzXG4gKiBAcmV0dXJuIHtBcnJheS48QXJyYXk+fSBhbiBhcnJheSBvZiBoYW5kcywgZWFjaCBoYW5kIHNwbGl0IGludG8gbGluZXNcbiAqL1xuZXhwb3J0cy5leHRyYWN0SGFuZHMgPSBmdW5jdGlvbiBleHRyYWN0SGFuZHMgKHR4dCkge1xuICBjb25zdCBsaW5lcyA9IGdldExpbmVzKHR4dClcbiAgY29uc3QgaGFuZHMgPSBbXVxuICBsZXQgaGFuZCA9IFtdXG5cbiAgbGV0IGkgPSAwXG4gIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldICYmICFsaW5lc1tpXS5sZW5ndGgpIGkrKyAgIC8vIGlnbm9yZSBsZWFkaW5nIGVtcHR5IGxpbmVzXG4gIGZvciAoOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV1cbiAgICBpZiAobGluZS5sZW5ndGgpIHtcbiAgICAgIGhhbmQucHVzaChsaW5lKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBoYW5kIGZpbmlzaGVkXG4gICAgICBpZiAoaGFuZC5sZW5ndGgpIGhhbmRzLnB1c2goaGFuZClcbiAgICAgIGhhbmQgPSBbXVxuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaV0gJiYgIWxpbmVzW2ldLmxlbmd0aCkgaSsrICAvLyBmaW5kIHN0YXJ0IG9mIG5leHQgbGluZVxuICAgIH1cbiAgfVxuICByZXR1cm4gaGFuZHNcbn1cblxuLy8gVGVzdFxuXG5mdW5jdGlvbiBpbnNwZWN0IChvYmosIGRlcHRoKSB7XG4gIGNvbnNvbGUuZXJyb3IocmVxdWlyZSgndXRpbCcpLmluc3BlY3Qob2JqLCBmYWxzZSwgZGVwdGggfHwgNSwgdHJ1ZSkpXG59XG5cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuICAvLyBjb25zdCBuYW1lID0gJ2FsbGluLXByZWZsb3AnXG4gIGNvbnN0IG5hbWUgPSAnYWN0aW9ub25hbGwnXG4gIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKVxuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG4gIGNvbnN0IGZpeHR1cmVzID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaG9sZGVtJylcbiAgY29uc3QgYWxsaGFuZHMgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKF9fZGlybmFtZSwgJ3Rlc3QnLCAnZml4dHVyZXMnLCAnaGFuZHMudHh0JyksICd1dGY4JylcbiAgY29uc3QgcmVzID0gZXhwb3J0cy5leHRyYWN0SGFuZHMoYWxsaGFuZHMpXG4gIGluc3BlY3QocmVzKVxuICAvKmNvbnN0IGhoYV9maXh0dXJlcyA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLicsICdoaGEnLCAndGVzdCcsICdmaXh0dXJlcycsICdob2xkZW0nKVxuICBjb25zdCB0eHQgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKGZpeHR1cmVzLCAncG9rZXJzdGFycycsIG5hbWUgKyAnLnR4dCcpLCAndXRmOCcpXG5cbiAgY29uc3QgcmVzID0gbW9kdWxlLmV4cG9ydHModHh0KVxuICBpbnNwZWN0KHJlcylcbiAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oaGhhX2ZpeHR1cmVzLCBuYW1lICsgJy5qc29uJyksXG4gICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkocmVzLCBudWxsLCAyKSxcbiAgICAgICAgICAgICAgICAgICAndXRmOCcpKi9cbn1cbiIsIi8qIGVzbGludC1kaXNhYmxlIGNvbW1hLXN0eWxlLCBvcGVyYXRvci1saW5lYnJlYWssIHNwYWNlLXVuYXJ5LW9wcywgbm8tbXVsdGktc3BhY2VzLCBrZXktc3BhY2luZywgaW5kZW50ICovXG4ndXNlIHN0cmljdCdcblxuY29uc3Qgc3RyaW5nVXRpbCAgICAgPSByZXF1aXJlKCcuLi91dGlsL3N0cmluZycpXG5jb25zdCBzYWZlUGFyc2VJbnQgICA9IHN0cmluZ1V0aWwuc2FmZVBhcnNlSW50XG5jb25zdCBzYWZlUGFyc2VGbG9hdCA9IHN0cmluZ1V0aWwuc2FmZVBhcnNlRmxvYXRcbmNvbnN0IHNhZmVUcmltICAgICAgID0gc3RyaW5nVXRpbC5zYWZlVHJpbVxuY29uc3Qgc2FmZUxvd2VyICAgICAgPSBzdHJpbmdVdGlsLnNhZmVMb3dlclxuY29uc3Qgc2FmZVVwcGVyICAgICAgPSBzdHJpbmdVdGlsLnNhZmVVcHBlclxuY29uc3Qgc2FmZUZpcnN0VXBwZXIgPSBzdHJpbmdVdGlsLnNhZmVGaXJzdFVwcGVyXG5cbmZ1bmN0aW9uIEhhbmRIaXN0b3J5UGFyc2VyIChsaW5lcykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgSGFuZEhpc3RvcnlQYXJzZXIpKSByZXR1cm4gbmV3IEhhbmRIaXN0b3J5UGFyc2VyKGxpbmVzKVxuXG4gIHRoaXMuX2xpbmVzID0gbGluZXNcblxuICB0aGlzLl9wb3N0ZWQgICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1ByZWZsb3AgID0gZmFsc2VcbiAgdGhpcy5fc2F3RmxvcCAgICAgPSBmYWxzZVxuICB0aGlzLl9zYXdUdXJuICAgICA9IGZhbHNlXG4gIHRoaXMuX3Nhd1JpdmVyICAgID0gZmFsc2VcbiAgdGhpcy5fc2F3U2hvd2Rvd24gPSBmYWxzZVxuICB0aGlzLl9zYXdTdW1tYXJ5ICA9IGZhbHNlXG5cbiAgdGhpcy5oYW5kID0ge1xuICAgICAgc2VhdHMgICAgOiBbXVxuICAgICwgcG9zdHMgICAgOiBbXVxuICAgICwgcHJlZmxvcCAgOiBbXVxuICAgICwgZmxvcCAgICAgOiBbXVxuICAgICwgdHVybiAgICAgOiBbXVxuICAgICwgcml2ZXIgICAgOiBbXVxuICAgICwgc2hvd2Rvd24gOiBbXVxuICB9XG59XG5cbnZhciBwcm90byA9IEhhbmRIaXN0b3J5UGFyc2VyLnByb3RvdHlwZVxucHJvdG8uX2hhbmRJbmZvUnggICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl90YWJsZUluZm9SeCAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fc2VhdEluZm9SeCAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX3Bvc3RSeCAgICAgICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9wcmVmbG9wSW5kaWNhdG9yUnggID0gdW5kZWZpbmVkXG5wcm90by5fc3RyZWV0SW5kaWNhdG9yUnggICA9IHVuZGVmaW5lZFxucHJvdG8uX3Nob3dkb3duSW5kaWNhdG9yUnggPSB1bmRlZmluZWRcbnByb3RvLl9zdW1tYXJ5SW5kaWNhdG9yUnggID0gdW5kZWZpbmVkXG5wcm90by5faG9sZWNhcmRzUnggICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX2FjdGlvblJ4ICAgICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9jb2xsZWN0UnggICAgICAgICAgID0gdW5kZWZpbmVkXG5wcm90by5fc2hvd1J4ICAgICAgICAgICAgICA9IHVuZGVmaW5lZFxucHJvdG8uX2JvYXJkUnggICAgICAgICAgICAgPSB1bmRlZmluZWRcbnByb3RvLl9tdWNrUnggICAgICAgICAgICAgID0gdW5kZWZpbmVkXG5cbnByb3RvLl9wcmVmbG9wSW5kaWNhdG9yID0gZnVuY3Rpb24gX3ByZWZsb3BJbmRpY2F0b3IgKGxpbmUsIGxpbmVubykge1xuICByZXR1cm4gdGhpcy5fcHJlZmxvcEluZGljYXRvclJ4LnRlc3QobGluZSlcbn1cblxucHJvdG8uX3Nob3dkb3duSW5kaWNhdG9yID0gZnVuY3Rpb24gX3Nob3dkb3duSW5kaWNhdG9yIChsaW5lLCBsaW5lbm8pIHtcbiAgcmV0dXJuIHRoaXMuX3Nob3dkb3duSW5kaWNhdG9yUngudGVzdChsaW5lKVxufVxuXG5wcm90by5fc3VtbWFyeUluZGljYXRvciA9ICBmdW5jdGlvbiBfc3VtbWFyeUluZGljYXRvciAobGluZSwgbGluZW5vKSB7XG4gIHJldHVybiB0aGlzLl9zdW1tYXJ5SW5kaWNhdG9yUngudGVzdChsaW5lKVxufVxuXG5wcm90by5faWRlbnRpZnlQb2tlclR5cGUgPSBmdW5jdGlvbiBfaWRlbnRpZnlQb2tlclR5cGUgKHMpIHtcbiAgaWYgKHR5cGVvZiBzID09PSAndW5kZWZpbmVkJykgcmV0dXJuIHVuZGVmaW5lZFxuICByZXR1cm4gICgvaG9sZCc/ZW0vaSkudGVzdChzKSA/ICdob2xkZW0nXG4gICAgICAgIDogKC9vbWFoYS9pKS50ZXN0KHMpICAgID8gJ29tYWhhJ1xuICAgICAgICA6ICdub3QgeWV0IHN1cHBvcnRlZCdcbn1cblxucHJvdG8uX2lkZW50aWZ5TGltaXQgPSBmdW5jdGlvbiBfaWRlbnRpZnlMaW1pdCAocykge1xuICBpZiAodHlwZW9mIHMgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gdW5kZWZpbmVkXG5cbiAgcmV0dXJuICAoLyhubyA/bGltaXR8bmwpL2kpLnRlc3QocykgID8gJ25vbGltaXQnXG4gICAgICAgIDogKC8ocG90ID9saW1pdHxwbCkvaSkudGVzdChzKSA/ICdwb3RsaW1pdCdcbiAgICAgICAgOiAnbm90IHlldCBzdXBwb3J0ZWQnXG59XG5cbnByb3RvLl9yZWFkSW5mbyA9IGZ1bmN0aW9uIF9yZWFkSW5mbyAobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoICAgID0gbGluZS5tYXRjaCh0aGlzLl9oYW5kSW5mb1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBkb25hdGlvbiA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzZdKVxuICBjb25zdCByYWtlICAgICA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzhdKVxuXG4gIHRoaXMuaGFuZC5pbmZvID0ge1xuICAgICAgcm9vbSAgICAgIDogc2FmZUxvd2VyKG1hdGNoWzFdKVxuICAgICwgaGFuZGlkICAgIDogbWF0Y2hbMl1cbiAgICAsIGdhbWV0eXBlICA6IHNhZmVMb3dlcihtYXRjaFszXSlcbiAgICAsIGdhbWVubyAgICA6IG1hdGNoWzRdXG4gICAgLCBjdXJyZW5jeSAgOiBtYXRjaFs1XVxuICAgICwgZG9uYXRpb24gIDogc2FmZVBhcnNlRmxvYXQoZG9uYXRpb24pXG4gICAgLCByYWtlICAgICAgOiBzYWZlUGFyc2VGbG9hdChyYWtlKVxuICAgICwgYnV5aW4gICAgIDogZG9uYXRpb24gKyByYWtlXG4gICAgLCBwb2tlcnR5cGUgOiB0aGlzLl9pZGVudGlmeVBva2VyVHlwZShtYXRjaFs5XSlcbiAgICAsIGxpbWl0ICAgICA6IHRoaXMuX2lkZW50aWZ5TGltaXQobWF0Y2hbMTBdKVxuICAgICwgbGV2ZWwgICAgIDogc2FmZUxvd2VyKG1hdGNoWzExXSlcbiAgICAsIHNiICAgICAgICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzEyXSlcbiAgICAsIGJiICAgICAgICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzEzXSlcbiAgICAsIHllYXIgICAgICA6IHNhZmVQYXJzZUludChtYXRjaFsxNF0pXG4gICAgLCBtb250aCAgICAgOiBzYWZlUGFyc2VJbnQobWF0Y2hbMTVdKVxuICAgICwgZGF5ICAgICAgIDogc2FmZVBhcnNlSW50KG1hdGNoWzE2XSlcbiAgICAsIGhvdXIgICAgICA6IHNhZmVQYXJzZUludChtYXRjaFsxN10pXG4gICAgLCBtaW4gICAgICAgOiBzYWZlUGFyc2VJbnQobWF0Y2hbMThdKVxuICAgICwgc2VjICAgICAgIDogc2FmZVBhcnNlSW50KG1hdGNoWzE5XSlcbiAgICAsIHRpbWV6b25lICA6IHNhZmVVcHBlcihtYXRjaFsyMF0pXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRUYWJsZSA9IGZ1bmN0aW9uIF9yZWFkVGFibGUgKGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fdGFibGVJbmZvUngpXG4gIGlmICghbWF0Y2gpIHJldHVyblxuXG4gIHRoaXMuaGFuZC50YWJsZSA9IHtcbiAgICAgIHRhYmxlbm8gIDogc2FmZVBhcnNlSW50KG1hdGNoWzFdKVxuICAgICwgbWF4c2VhdHMgOiBzYWZlUGFyc2VJbnQobWF0Y2hbMl0pXG4gICAgLCBidXR0b24gICA6IHNhZmVQYXJzZUludChtYXRjaFszXSlcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFNlYXQgPSBmdW5jdGlvbiBfcmVhZFNlYXQgKGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fc2VhdEluZm9SeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgdGhpcy5oYW5kLnNlYXRzLnB1c2goe1xuICAgICAgc2VhdG5vOiBzYWZlUGFyc2VJbnQobWF0Y2hbMV0pXG4gICAgLCBwbGF5ZXI6IG1hdGNoWzJdLnRyaW0oKVxuICAgICwgY2hpcHM6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzNdKVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9KVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcG9zdFR5cGUgPSBmdW5jdGlvbiBfcG9zdFR5cGUgKHMpIHtcbiAgcmV0dXJuICBzID09PSAnYW50ZScgPyAgJ2FudGUnXG4gICAgICAgIDogcyA9PT0gJ2JpZyBibGluZCcgPyAnYmInXG4gICAgICAgIDogcyA9PT0gJ3NtYWxsIGJsaW5kJyA/ICdzYidcbiAgICAgICAgOiAndW5rbm93bidcbn1cblxucHJvdG8uX3JlYWRQb3N0ID0gZnVuY3Rpb24gX3JlYWRQb3N0IChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3Bvc3RSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgY29uc3QgdHlwZSAgID0gdGhpcy5fcG9zdFR5cGUobWF0Y2hbMl0pXG4gIGNvbnN0IGFtb3VudCA9IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzNdKVxuXG4gIHRoaXMuaGFuZC5wb3N0cy5wdXNoKHtcbiAgICAgIHBsYXllcjogbWF0Y2hbMV1cbiAgICAsIHR5cGU6IHR5cGVcbiAgICAsIGFtb3VudDogYW1vdW50XG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH0pXG4gIGlmICh0eXBlID09PSAnYW50ZScgJiYgIXRoaXMuaGFuZC5pbmZvLmFudGUpIHRoaXMuaGFuZC5pbmZvLmFudGUgPSBhbW91bnRcbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRIb2xlQ2FyZHMgPSBmdW5jdGlvbiBfcmVhZEhvbGVDYXJkcyAobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9ob2xlY2FyZHNSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgdGhpcy5oYW5kLmhlcm8gPSBtYXRjaFsxXVxuICB0aGlzLmhhbmQuaG9sZWNhcmRzID0ge1xuICAgICAgY2FyZDE6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzJdKSlcbiAgICAsIGNhcmQyOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8uX3JlYWRTdHJlZXQgPSBmdW5jdGlvbiBfcmVhZFN0cmVldCAobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9zdHJlZXRJbmRpY2F0b3JSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgdGhpcy5oYW5kLmJvYXJkID0ge1xuICAgICAgY2FyZDE6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzJdKSlcbiAgICAsIGNhcmQyOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBjYXJkMzogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNF0pKVxuICAgICwgY2FyZDQ6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzVdKSlcbiAgICAsIGNhcmQ1OiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFs2XSkpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgaWYgKG1hdGNoWzFdID09PSAnRkxPUCcpIHRoaXMuX3Nhd0Zsb3AgPSB0cnVlXG4gIGlmIChtYXRjaFsxXSA9PT0gJ1RVUk4nKSB7XG4gICAgdGhpcy5fc2F3VHVybiA9IHRydWVcbiAgICB0aGlzLmhhbmQuYm9hcmQuY2FyZDQgPSB0aGlzLmhhbmQuYm9hcmQuY2FyZDVcbiAgICB0aGlzLmhhbmQuYm9hcmQuY2FyZDUgPSB1bmRlZmluZWRcbiAgfVxuICBpZiAobWF0Y2hbMV0gPT09ICdSSVZFUicpIHRoaXMuX3Nhd1JpdmVyID0gdHJ1ZVxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZFNob3cgPSAgZnVuY3Rpb24gX3JlYWRTaG93IChsaW5lLCBsaW5lbm8pIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuX3Nob3dSeClcbiAgaWYgKCFtYXRjaCkgcmV0dXJuXG5cbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IG1hdGNoWzFdXG4gICAgLCB0eXBlICAgIDogJ3Nob3cnXG4gICAgLCBjYXJkMSAgIDogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMl0pKVxuICAgICwgY2FyZDIgICA6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzNdKSlcbiAgICAsIGRlc2MgICAgOiBtYXRjaFs0XVxuICAgICwgbWV0YWRhdGE6IHtcbiAgICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAgICwgcmF3OiBsaW5lXG4gICAgfVxuICB9XG4gIHRoaXMuaGFuZC5zaG93ZG93bi5wdXNoKGFjdGlvbilcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5wcm90by5fcmVhZE11Y2sgPSBmdW5jdGlvbiBfcmVhZE11Y2sgKGxpbmUsIGxpbmVubykge1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5fbXVja1J4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCBhY3Rpb24gPSB7XG4gICAgICBwbGF5ZXIgOiBtYXRjaFsxXVxuICAgICwgdHlwZSAgIDogJ211Y2snXG4gICAgLCBjYXJkMSAgOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFsyXSkpXG4gICAgLCBjYXJkMiAgOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBtZXRhZGF0YToge1xuICAgICAgICBsaW5lbm86IGxpbmVub1xuICAgICAgLCByYXc6IGxpbmVcbiAgICB9XG4gIH1cbiAgdGhpcy5oYW5kLnNob3dkb3duLnB1c2goYWN0aW9uKVxufVxuXG5wcm90by5fcmVhZEJvYXJkID0gZnVuY3Rpb24gX3JlYWRCb2FyZCAobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCh0aGlzLl9ib2FyZFJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICB0aGlzLmhhbmQuYm9hcmQgPSB7XG4gICAgICBjYXJkMTogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbMV0pKVxuICAgICwgY2FyZDI6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzJdKSlcbiAgICAsIGNhcmQzOiBzYWZlRmlyc3RVcHBlcihzYWZlVHJpbShtYXRjaFszXSkpXG4gICAgLCBjYXJkNDogc2FmZUZpcnN0VXBwZXIoc2FmZVRyaW0obWF0Y2hbNF0pKVxuICAgICwgY2FyZDU6IHNhZmVGaXJzdFVwcGVyKHNhZmVUcmltKG1hdGNoWzVdKSlcbiAgICAsIG1ldGFkYXRhOiB7XG4gICAgICAgIGxpbmVubzogbGluZW5vXG4gICAgICAsIHJhdzogbGluZVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhY3Rpb25UeXBlIChzKSB7XG4gIHJldHVybiBzLnJlcGxhY2UoLyhlZHxzKSQvLCAnJylcbn1cblxucHJvdG8uX3JlYWRBY3Rpb24gPSBmdW5jdGlvbiBfcmVhZEFjdGlvbiAobGluZSwgbGluZW5vKSB7XG4gIGNvbnN0IG1hdGNoID0gdGhpcy5fc2F3U2hvd2Rvd24gPyBsaW5lLm1hdGNoKHRoaXMuX2NvbGxlY3RSeCkgOiBsaW5lLm1hdGNoKHRoaXMuX2FjdGlvblJ4KVxuICBpZiAoIW1hdGNoKSByZXR1cm5cblxuICBjb25zdCB0eXBlID0gYWN0aW9uVHlwZShtYXRjaFsyXSlcbiAgY29uc3QgYWN0aW9uID0ge1xuICAgICAgcGxheWVyICA6IG1hdGNoWzFdXG4gICAgLCB0eXBlICAgIDogdHlwZVxuICAgICwgYW1vdW50ICA6IHNhZmVQYXJzZUZsb2F0KG1hdGNoWzNdKVxuICB9XG4gIGlmICh0eXBlID09PSAncmFpc2UnKSB7XG4gICAgYWN0aW9uLnJhaXNlVG8gPSBzYWZlUGFyc2VGbG9hdChtYXRjaFs0XSlcbiAgICBhY3Rpb24uYWxsaW4gPSAhIW1hdGNoWzVdXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NhbGwnIHx8IHR5cGUgPT09ICdiZXQnKSB7XG4gICAgYWN0aW9uLmFsbGluID0gISFtYXRjaFs1XVxuICB9XG5cbiAgYWN0aW9uLm1ldGFkYXRhID0ge1xuICAgICAgbGluZW5vOiBsaW5lbm9cbiAgICAsIHJhdzogbGluZVxuICB9XG5cbiAgaWYgKHRoaXMuX3Nhd1Nob3dkb3duKSB7XG4gICAgdGhpcy5oYW5kLnNob3dkb3duLnB1c2goYWN0aW9uKVxuICB9IGVsc2UgaWYgKHRoaXMuX3Nhd1JpdmVyKSB7XG4gICAgdGhpcy5oYW5kLnJpdmVyLnB1c2goYWN0aW9uKVxuICB9IGVsc2UgaWYgKHRoaXMuX3Nhd1R1cm4pIHtcbiAgICB0aGlzLmhhbmQudHVybi5wdXNoKGFjdGlvbilcbiAgfSBlbHNlIGlmICh0aGlzLl9zYXdGbG9wKSB7XG4gICAgdGhpcy5oYW5kLmZsb3AucHVzaChhY3Rpb24pXG4gIH0gZWxzZSB7XG4gICAgdGhpcy5oYW5kLnByZWZsb3AucHVzaChhY3Rpb24pXG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxucHJvdG8ucGFyc2UgPSBmdW5jdGlvbiBwYXJzZSAoKSB7XG4gIGNvbnN0IGxpbmVzID0gdGhpcy5fbGluZXNcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgIGlmICh0aGlzLl9zYXdTdW1tYXJ5KSB7XG4gICAgICBpZiAodGhpcy5fcmVhZEJvYXJkKGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkTXVjayhsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Nhd1N1bW1hcnkgPSB0aGlzLl9zdW1tYXJ5SW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1N1bW1hcnkpIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3Nhd1Nob3dkb3duKSB7XG4gICAgICBpZiAodGhpcy5fcmVhZFNob3cobGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9zYXdTaG93ZG93biA9IHRoaXMuX3Nob3dkb3duSW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1Nob3dkb3duKSBjb250aW51ZVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9zYXdQcmVmbG9wKSB7XG4gICAgICBpZiAoIXRoaXMuX3Nhd0Zsb3AgJiYgIXRoaXMuaGFuZC5ob2xlY2FyZHMpIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWRIb2xlQ2FyZHMobGluZXNbaV0sIGkpKSB7XG4gICAgICAgICAgdGhpcy5fc2F3UHJlZmxvcCA9IHRydWVcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fcmVhZFN0cmVldChsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgICBpZiAodGhpcy5fcmVhZEFjdGlvbihsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Nhd1ByZWZsb3AgPSB0aGlzLl9wcmVmbG9wSW5kaWNhdG9yKGxpbmVzW2ldLCBpKVxuICAgICAgaWYgKHRoaXMuX3Nhd1ByZWZsb3ApIGNvbnRpbnVlXG4gICAgICBpZiAodGhpcy5fcmVhZFBvc3QobGluZXNbaV0sIGkpKSB7XG4gICAgICAgIHRoaXMuX3Bvc3RlZCA9IHRydWVcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuX3Bvc3RlZCkge1xuICAgICAgaWYgKCF0aGlzLmhhbmQuaW5mbykgICBpZiAodGhpcy5fcmVhZEluZm8obGluZXNbaV0sIGkpKSBjb250aW51ZVxuICAgICAgaWYgKCF0aGlzLmhhbmQudGFibGUpICBpZiAodGhpcy5fcmVhZFRhYmxlKGxpbmVzW2ldLCBpKSkgY29udGludWVcbiAgICAgIGlmICh0aGlzLl9yZWFkU2VhdChsaW5lc1tpXSwgaSkpIGNvbnRpbnVlXG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzLmhhbmRcbn1cblxucHJvdG8uY2FuUGFyc2UgPSBmdW5jdGlvbiBjYW5QYXJzZSAoKSB7XG4gIGNvbnN0IGxpbmVzID0gdGhpcy5fbGluZXNcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaV0ubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAodGhpcy5faGFuZEluZm9SeC50ZXN0KGxpbmVzW2ldKSkgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIYW5kSGlzdG9yeVBhcnNlclxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBIYW5kSGlzdG9yeVBhcnNlciA9IHJlcXVpcmUoJy4vYmFzZScpXG5cbmZ1bmN0aW9uIEhvbGRlbVBva2VyU3RhcnNQYXJzZXIgKGxpbmVzKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKSkgcmV0dXJuIG5ldyBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKGxpbmVzKVxuICBIYW5kSGlzdG9yeVBhcnNlci5jYWxsKHRoaXMsIGxpbmVzKVxufVxuXG5Ib2xkZW1Qb2tlclN0YXJzUGFyc2VyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoSGFuZEhpc3RvcnlQYXJzZXIucHJvdG90eXBlKVxuSG9sZGVtUG9rZXJTdGFyc1BhcnNlci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyXG5jb25zdCBwcm90byA9IEhvbGRlbVBva2VyU3RhcnNQYXJzZXIucHJvdG90eXBlXG5cbnByb3RvLl9oYW5kSW5mb1J4ID0gbmV3IFJlZ0V4cChcbiAgICAvLyBQb2tlclN0YXJzIEhhbmQgIzE0OTY1MTk5MjU0ODpcbiAgICAnXihQb2tlclN0YXJzKSBIYW5kICMoXFxcXGQrKTogJ1xuICAgIC8vIFRvdXJuYW1lbnQgIzE0OTUxOTI2MzAsXG4gICsgJyhUb3VybmFtZW50KSAjKFxcXFxkKyksICdcbiAgICAvLyAkMC45MSskMC4wOVxuICArICcoWyR84oKsXSkoW1xcXFxkXStcXFxcLlxcXFxkKylcXFxcKyhbJHzigqxdKShbXFxcXGRdK1xcXFwuXFxcXGQrKS4rJ1xuICAgIC8vIFVTRCBIb2xkJ2VtIE5vIExpbWl0IC1cbiAgKyAnKEhvbGRcXCdlbSkgKE5vIExpbWl0KSAtICdcbiAgICAvLyBMZXZlbCBYSSAoNDAwLzgwMClcbiAgKyAnTGV2ZWwgKFteKF0rKVxcXFwoKFteL10rKS8oW14pXSspXFxcXCknXG4gICAgLy8gMjAxNi8wMy8wMVxuICArICdbXlxcXFxkXSooXFxcXGR7NH0pLihcXFxcZHsyfSkuKFxcXFxkezJ9KSdcbiAgICAvLyAxOjI5OjQxIEVUXG4gICsgJ1teXFxcXGRdKihbXjpdKyk6KFteOl0rKTooW14gXSspICguKykkJ1xuKVxuXG4vKlxuICogTWF0Y2hlczpcbiAqICAgIDEgIFBva2VyU3RhcnMgICAgICAgICAyICAxNDk2NTE5OTI1NDggIDMgIFRvdXJuYW1lbnQgIDQgIDE0OTUxOTI2MzBcbiAqICAgIDUgICQgICAgICAgICAgICAgICAgICA2ICAwLjkxICA3ICAkICAgIDggMC4wOVxuICogICAgOSAgSG9sZCdlbSAgICAgICAgICAgMTAgTm8gTGltaXQgICAgICAxMSBYSSAgICAgICAgICAxMiA0MDAgIDEzIDgwMFxuICogICAgMTQgMjAxNiAgICAgICAgICAgICAgMTUgMDMgICAgMTYgMDFcbiAqICAgIDE3IDEgICAgICAgICAgICAgICAgIDE4IDI5ICAgIDE5IDQxICAgMjAgRVRcbiovXG5cbnByb3RvLl90YWJsZUluZm9SeCAgICAgICAgID0gL15UYWJsZSAnXFxkKyAoXFxkKyknIChcXGQrKS1tYXggU2VhdCAjKFxcZCspIGlzLitidXR0b24kL1xucHJvdG8uX3NlYXRJbmZvUnggICAgICAgICAgPSAvXlNlYXQgKFxcZCspOiAoW14oXSspXFwoKFxcZCspIGluIGNoaXBzXFwpJC9cbnByb3RvLl9wb3N0UnggICAgICAgICAgICAgID0gL14oW146XSspOiBwb3N0cyAoPzp0aGUgKT8oYW50ZXxzbWFsbCBibGluZHxiaWcgYmxpbmQpIChcXGQrKSQvXG5wcm90by5fcHJlZmxvcEluZGljYXRvclJ4ICA9IC9eXFwqXFwqXFwqIEhPTEUgQ0FSRFMgXFwqXFwqXFwqJC9cbnByb3RvLl9zdHJlZXRJbmRpY2F0b3JSeCAgID0gL15cXCpcXCpcXCogKEZMT1B8VFVSTnxSSVZFUikgXFwqXFwqXFwqW15bXStcXFsoLi4pICguLikgKC4uKSg/OiAoLi4pKT9cXF0oPzogXFxbKC4uKVxcXSk/JC9cbnByb3RvLl9zaG93ZG93bkluZGljYXRvclJ4ID0gL15cXCpcXCpcXCogU0hPVyBET1dOIFxcKlxcKlxcKiQvXG5wcm90by5fc3VtbWFyeUluZGljYXRvclJ4ICA9IC9eXFwqXFwqXFwqIFNVTU1BUlkgXFwqXFwqXFwqJC9cbnByb3RvLl9ob2xlY2FyZHNSeCAgICAgICAgID0gL15EZWFsdCB0byAoW15bXSspIFxcWyguLikgKC4uKVxcXSQvXG5wcm90by5fYWN0aW9uUnggICAgICAgICAgICA9IC9eKFteOl0rKTogKHJhaXNlc3xiZXRzfGNhbGxzfGNoZWNrc3xmb2xkcykgPyhcXGQrKT8oPzogdG8gKFxcZCspKT8oLithbGwtaW4pPyQvXG5wcm90by5fY29sbGVjdFJ4ICAgICAgICAgICA9IC9eKFteIF0rKSAoY29sbGVjdGVkKSAoXFxkKykgZnJvbS4rcG90JC9cbnByb3RvLl9zaG93UnggICAgICAgICAgICAgID0gL14oW146XSspOiBzaG93cyBcXFsoLi4pICguLilcXF0gXFwoKFteKV0rKVxcKSQvXG5wcm90by5fYm9hcmRSeCAgICAgICAgICAgICA9IC9eQm9hcmQgXFxbKC4uKT8oIC4uKT8oIC4uKT8oIC4uKT8oIC4uKT9dJC9cbnByb3RvLl9tdWNrUnggICAgICAgICAgICAgID0gL15TZWF0IFxcZCs6IChbXiBdKykgbXVja2VkIFxcWyguLikgKC4uKVxcXSQvXG5cbmV4cG9ydHMuY2FuUGFyc2UgPSBmdW5jdGlvbiBjYW5QYXJzZSAobGluZXMpIHtcbiAgcmV0dXJuIG5ldyBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKGxpbmVzKS5jYW5QYXJzZSgpXG59XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiBwYXJzZSAobGluZXMpIHtcbiAgcmV0dXJuIG5ldyBIb2xkZW1Qb2tlclN0YXJzUGFyc2VyKGxpbmVzKS5wYXJzZSgpXG59XG4iLCIndXNlIHN0cmljdCdcblxuZXhwb3J0cy50cmltTGluZSA9IGZ1bmN0aW9uIHRyaW1MaW5lIChsaW5lKSB7IHJldHVybiBsaW5lLnRyaW0oKSB9XG5leHBvcnRzLmVtcHR5TGluZSA9IGZ1bmN0aW9uIGVtcHR5TGluZSAobGluZSkgeyByZXR1cm4gbGluZS5sZW5ndGggfVxuZXhwb3J0cy5zYWZlTG93ZXIgPSBmdW5jdGlvbiBzYWZlTG93ZXIgKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBzLnRvTG93ZXJDYXNlKClcbn1cbmV4cG9ydHMuc2FmZVVwcGVyID0gZnVuY3Rpb24gc2FmZVVwcGVyIChzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3VuZGVmaW5lZCdcbiAgICA/IHVuZGVmaW5lZFxuICAgIDogcy50b1VwcGVyQ2FzZSgpXG59XG5leHBvcnRzLnNhZmVGaXJzdFVwcGVyID0gZnVuY3Rpb24gc2FmZUZpcnN0VXBwZXIgKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJyB8fCBzLmxlbmd0aCA8IDFcbiAgICA/IHNcbiAgICA6IHNbMF0udG9VcHBlckNhc2UoKSArIHMuc2xpY2UoMSlcbn1cbmV4cG9ydHMuc2FmZVRyaW0gPSBmdW5jdGlvbiBzYWZlVHJpbSAocykge1xuICByZXR1cm4gdHlwZW9mIHMgPT09ICd1bmRlZmluZWQnXG4gICAgPyB1bmRlZmluZWRcbiAgICA6IHMudHJpbSgpXG59XG5leHBvcnRzLnNhZmVQYXJzZUludCA9IGZ1bmN0aW9uIHNhZmVQYXJzZUludCAocykge1xuICByZXR1cm4gdHlwZW9mIHMgPT09ICd1bmRlZmluZWQnXG4gICAgPyB1bmRlZmluZWRcbiAgICA6IHBhcnNlSW50KHMpXG59XG5leHBvcnRzLnNhZmVQYXJzZUZsb2F0ID0gZnVuY3Rpb24gc2FmZVBhcnNlRmxvYXQgKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAndW5kZWZpbmVkJ1xuICAgID8gdW5kZWZpbmVkXG4gICAgOiBwYXJzZUZsb2F0KHMpXG59XG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBjb21tYS1zdHlsZSwgb3BlcmF0b3ItbGluZWJyZWFrLCBzcGFjZS11bmFyeS1vcHMsIG5vLW11bHRpLXNwYWNlcywga2V5LXNwYWNpbmcsIGluZGVudCAqL1xuJ3VzZSBzdHJpY3QnXG5cbmNvbnN0IGhodiA9IHJlcXVpcmUoJy4uL2hodicpXG5jb25zdCBoaHAgPSByZXF1aXJlKCdoaHAnKVxuY29uc3QgaGhhID0gcmVxdWlyZSgnaGhhJylcblxuY29uc3QgdmlzdWFsaXplZEhhbmRzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlzdWFsaXplZC1oYW5kcycpXG5jb25zdCBoYW5kaGlzdG9yeUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hhbmRoaXN0b3J5LWVudHJ5JylcblxuaGh2LmluamVjdFN0eWxlKGhodi5jc3MsIGRvY3VtZW50LCAnaGh2LWhhbmQtY3NzJylcblxuZnVuY3Rpb24gYnlEYXRlVGltZSAoaDEsIGgyKSB7XG4gIGNvbnN0IGkxID0gaDEuaW5mb1xuICBjb25zdCBpMiA9IGgyLmluZm9cbiAgaWYgKGkxLnllYXIgPCBpMi55ZWFyKSAgIHJldHVybiAtMVxuICBpZiAoaTEueWVhciA+IGkyLnllYXIpICAgcmV0dXJuICAxXG4gIGlmIChpMS5tb250aCA8IGkyLm1vbnRoKSByZXR1cm4gLTFcbiAgaWYgKGkxLm1vbnRoID4gaTIubW9udGgpIHJldHVybiAgMVxuICBpZiAoaTEuZGF5IDwgaTIuZGF5KSAgICAgcmV0dXJuIC0xXG4gIGlmIChpMS5kYXkgPiBpMi5kYXkpICAgICByZXR1cm4gIDFcbiAgaWYgKGkxLmhvdXIgPCBpMi5ob3VyKSAgIHJldHVybiAtMVxuICBpZiAoaTEuaG91ciA+IGkyLmhvdXIpICAgcmV0dXJuICAxXG4gIGlmIChpMS5taW4gPCBpMi5taW4pICAgICByZXR1cm4gLTFcbiAgaWYgKGkxLm1pbiA+IGkyLm1pbikgICAgIHJldHVybiAgMVxuICBpZiAoaTEuc2VjIDwgaTIuc2VjKSAgICAgcmV0dXJuIC0xXG4gIGlmIChpMS5zZWMgPiBpMi5zZWMpICAgICByZXR1cm4gIDFcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZVRpbWUgKGFuYWx5emVkKSB7XG4gIHJldHVybiBhbmFseXplZC5zb3J0KGJ5RGF0ZVRpbWUpXG59XG5cbmZ1bmN0aW9uIGFuYWx5emVIaXN0b3J5IChoKSB7XG4gIGNvbnN0IHBhcnNlZCA9IGhocChoKVxuICB0cnkge1xuICAgIHJldHVybiBoaGEocGFyc2VkKVxuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICAgIGNvbnNvbGUuZXJyb3IoaClcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoaCkge1xuICByZXR1cm4gaGh2LnJlbmRlcihoKVxufVxuXG5mdW5jdGlvbiBpc251bGwgKHgpIHsgcmV0dXJuICEheCB9XG5cbmNvbnN0IGhpc3RvcnlUeHQgPSBoYW5kaGlzdG9yeUVsLnRleHRDb250ZW50LnRyaW0oKVxuY29uc3QgaGlzdG9yaWVzID0gaGhwLmV4dHJhY3RIYW5kcyhoaXN0b3J5VHh0KVxuY29uc3QgYW5hbHl6ZWQgPSBoaXN0b3JpZXMubWFwKGFuYWx5emVIaXN0b3J5KS5maWx0ZXIoaXNudWxsKVxuY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZVRpbWUoYW5hbHl6ZWQpXG5jb25zdCByZW5kZXJlZCA9IHNvcnRlZC5tYXAocmVuZGVyKS5qb2luKCcnKVxudmlzdWFsaXplZEhhbmRzRWwuaW5uZXJIVE1MID0gcmVuZGVyZWRcblxuLy8gaGh2LmZpbHRlclBsYXllcih7IGZpbHRlcjogJ2ludmVzdGVkJywgd2hvOiAnaGVsZCcgfSlcbmhodi5maWx0ZXJQbGF5ZXIoeyBmaWx0ZXI6ICdpbnZlc3RlZCcsIHdobzogJ2hlbGQnIH0pXG5cbiIsIi8qIGVzbGludC1kaXNhYmxlIGNvbW1hLXN0eWxlLCBvcGVyYXRvci1saW5lYnJlYWssIHNwYWNlLXVuYXJ5LW9wcywgbm8tbXVsdGktc3BhY2VzLCBrZXktc3BhY2luZywgaW5kZW50ICovXG4ndXNlIHN0cmljdCdcblxuY29uc3QgaW5qZWN0U3R5bGUgPSByZXF1aXJlKCcuL2xpYi9pbmplY3Qtc3R5bGUnKVxuY29uc3QgdGVtcGxhdGVzID0gcmVxdWlyZSgnLi9saWIvdGVtcGxhdGVzJylcbmNvbnN0IGNzcyAgICAgICA9IHRlbXBsYXRlcy5jc3NcbmNvbnN0IGZpbHRlckNzcyA9IHRlbXBsYXRlcy5maWx0ZXJDc3NcbmNvbnN0IGhlYWQgICAgICA9IHRlbXBsYXRlcy5oZWFkKHsgY3NzOiBjc3MgfSlcbmNvbnN0IGhvbGRlbSAgICA9IHRlbXBsYXRlcy5ob2xkZW1cblxuZnVuY3Rpb24gb25lRGVjaW1hbCAoeCkge1xuICByZXR1cm4gKHggfHwgMCkudG9GaXhlZCgxKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdWl0IChzKSB7XG4gIHN3aXRjaCAocykge1xuICAgIGNhc2UgJ3MnOiByZXR1cm4gJ+KZoCdcbiAgICBjYXNlICdoJzogcmV0dXJuICfimaUnXG4gICAgY2FzZSAnZCc6IHJldHVybiAn4pmmJ1xuICAgIGNhc2UgJ2MnOiByZXR1cm4gJ+KZoydcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJDYXJkIChjKSB7XG4gIGlmICh0eXBlb2YgYyA9PT0gJ3VuZGVmaW5lZCcgfHwgYy5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgY29uc3Qgc3VpdCA9IHJlbmRlclN1aXQoY1sxXSlcbiAgcmV0dXJuICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXZhbHVlXCI+J1xuICAgICAgICAgICAgKyBjWzBdICtcbiAgICAgICAgICAnPC9zcGFuPicgK1xuICAgICAgICAgICc8c3BhbiBjbGFzcz1cImhodi1jYXJkLXN1aXQgJyArIGNbMV0gKyAnXCI+J1xuICAgICAgICAgICAgKyBzdWl0ICtcbiAgICAgICAgICAnPC9zcGFuPidcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ2FyZHMgKGNhcmRzKSB7XG4gIGlmICghY2FyZHMpIHJldHVybiAnJ1xuICBmdW5jdGlvbiByZW5kZXIgKGFjYywgaykge1xuICAgIGFjY1trXSA9IHJlbmRlckNhcmQoY2FyZHNba10pXG4gICAgcmV0dXJuIGFjY1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhjYXJkcykucmVkdWNlKHJlbmRlciwge30pXG59XG5cbmZ1bmN0aW9uIHNob3J0ZW5BY3Rpb25UeXBlICh0eXBlKSB7XG4gIHJldHVybiAgdHlwZSA9PT0gJ2ZvbGQnICAgICA/ICdGJ1xuICAgICAgICA6IHR5cGUgPT09ICdjaGVjaycgICAgPyAnWCdcbiAgICAgICAgOiB0eXBlID09PSAnY2FsbCcgICAgID8gJ0MnXG4gICAgICAgIDogdHlwZSA9PT0gJ2JldCcgICAgICA/ICdCJ1xuICAgICAgICA6IHR5cGUgPT09ICdyYWlzZScgICAgPyAnUidcbiAgICAgICAgOiB0eXBlID09PSAnY29sbGVjdCcgID8gJ1cnXG4gICAgICAgIDogKGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gYWN0aW9uIHR5cGUnLCB0eXBlKSwgJz8nKVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJlZXQgKGFjdGlvbnMsIGluZGVudCkge1xuICBsZXQgcyA9IGluZGVudCA/ICdfX19fXyAnIDogJydcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYSA9IGFjdGlvbnNbaV1cbiAgICBzICs9ICBzaG9ydGVuQWN0aW9uVHlwZShhLnR5cGUpICsgJyAnXG4gICAgICAgICsgKGEuaGFzT3duUHJvcGVydHkoJ3JhdGlvJylcbiAgICAgICAgICAgID8gb25lRGVjaW1hbChhLnJhdGlvKVxuICAgICAgICAgICAgOiAnICAgJylcbiAgICAgICAgKyAoYS5hbGxpbiA/ICcgQScgOiAnJylcbiAgICAgICAgKyAnICdcbiAgfVxuICByZXR1cm4gcy50cmltKClcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGxheWVyIChwKSB7XG4gIHJldHVybiB7XG4gICAgICBwb3MgICAgICA6IChwLnBvcyB8fCAnPz8nKS50b1VwcGVyQ2FzZSgpXG4gICAgLCBuYW1lICAgICA6IHAubmFtZVxuICAgICwgY2FyZHMgICAgOiByZW5kZXJDYXJkcyhwLmNhcmRzKVxuICAgICwgbSAgICAgICAgOiBwLm1cbiAgICAsIHByZWZsb3AgIDogcmVuZGVyU3RyZWV0KHAucHJlZmxvcCwgcC5iYiB8fCBwLnNiKVxuICAgICwgZmxvcCAgICAgOiByZW5kZXJTdHJlZXQocC5mbG9wLCBmYWxzZSlcbiAgICAsIHR1cm4gICAgIDogcmVuZGVyU3RyZWV0KHAudHVybiwgZmFsc2UpXG4gICAgLCByaXZlciAgICA6IHJlbmRlclN0cmVldChwLnJpdmVyLCBmYWxzZSlcbiAgICAsIHNob3dkb3duIDogcmVuZGVyU3RyZWV0KHAuc2hvd2Rvd24sIGZhbHNlKVxuICAgICwgaW52ZXN0ZWQgOiBwLmludmVzdGVkXG4gICAgLCBzYXdGbG9wICA6IHAuc2F3RmxvcFxuICB9XG59XG5cbmZ1bmN0aW9uIGlmVHJ1ZSAoa2V5LCBvYmosIHNwYWNlLCBhbHRlcm5hdGl2ZSwga2V5UmVwbGFjZW1lbnQpIHtcbiAgcmV0dXJuIG9ialtrZXldID8gc3BhY2UgKyAoa2V5UmVwbGFjZW1lbnQgfHwga2V5KSA6IGFsdGVybmF0aXZlXG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5hbWUgKG4pIHtcbiAgcmV0dXJuIG4ucmVwbGFjZSgvIC9nLCAnXycpXG59XG5cbmZ1bmN0aW9uIHJlbmRlckluZm8gKGksIHBsYXllcnMpIHtcbiAgY29uc3QgaW5mbyA9IHtcbiAgICAgIGJiICAgICAgIDogaS5iYlxuICAgICwgc2IgICAgICAgOiBpLnNiXG4gICAgLCBib2FyZCAgICA6IGkuYm9hcmRcbiAgICAsIHllYXIgICAgIDogaS55ZWFyXG4gICAgLCBtb250aCAgICA6IGkubW9udGhcbiAgICAsIGRheSAgICAgIDogaS5kYXlcbiAgICAsIGhvdXIgICAgIDogaS5ob3VyXG4gICAgLCBtaW4gICAgICA6IGkubWluXG4gICAgLCBzZWMgICAgICA6IGkuc2VjXG4gICAgLCBnYW1ldHlwZSA6IGkuZ2FtZXR5cGVcbiAgICAsIGdhbWVubyAgIDogaS5nYW1lbm9cbiAgfVxuXG4gIGluZm8uYW55QWN0aXZpdHkgPSAgaWZUcnVlKCdhbnlJbnZlc3RlZCcsIGksICcgJywgJycsICdhbnktaW52ZXN0ZWQnKVxuICAgICAgICAgICAgICAgICAgICArIGlmVHJ1ZSgnYW55U2F3RmxvcCcsIGksICcgJywgJycsICdhbnktc2F3RmxvcCcpXG5cbiAgaW5mby5wbGF5ZXJBY3Rpdml0eSA9ICcnXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHAgPSBwbGF5ZXJzW2ldXG4gICAgY29uc3QgbmFtZSA9IG5vcm1hbGl6ZU5hbWUocC5uYW1lKVxuICAgIGluZm8ucGxheWVyQWN0aXZpdHkgKz0gKG5hbWUgKyAnICdcbiAgICAgICAgICAgICAgICAgICAgICAgICsgICBuYW1lICsgJy0nICsgaWZUcnVlKCdpbnZlc3RlZCcsIHAsICcnLCAnbm90aW52ZXN0ZWQnKSArICcgJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAgIG5hbWUgKyAnLScgKyBpZlRydWUoJ3Nhd0Zsb3AnLCBwLCAnJywgJ25vdHNhd0Zsb3AnKSArICcgJylcbiAgfVxuICByZXR1cm4gaW5mb1xufVxuXG5leHBvcnRzLmNzcyAgICAgICA9IGNzcygpXG5leHBvcnRzLmZpbHRlckNzcyA9IGZpbHRlckNzc1xuZXhwb3J0cy5oZWFkICAgICAgPSBoZWFkXG5cbmV4cG9ydHMuaW5qZWN0U3R5bGUgPSBpbmplY3RTdHlsZVxuXG5mdW5jdGlvbiBnZXRTaG93cyAob3B0cywgd2hvKSB7XG4gIGxldCBzaG93XG4gIGxldCBzaG93SGFuZFxuICBpZiAob3B0cy5maWx0ZXIgPT09ICdpbnZlc3RlZCcpIHtcbiAgICBzaG93ID0gJ2ludmVzdGVkJ1xuICAgIHNob3dIYW5kID0gd2hvICsgJy1pbnZlc3RlZCdcbiAgfSBlbHNlIGlmIChvcHRzLmZpbHRlciA9PT0gJ3Nhd0Zsb3AnKSB7XG4gICAgc2hvdyA9ICdzYXdGbG9wJ1xuICAgIHNob3dIYW5kID0gd2hvICsgJy1zYXdGbG9wJ1xuICB9XG4gIHJldHVybiB7IHNob3c6IHNob3csIHNob3dIYW5kOiBzaG93SGFuZCB9XG59XG5leHBvcnRzLmZpbHRlclBsYXllcnMgPSBmdW5jdGlvbiBmaWx0ZXJQbGF5ZXJzIChvcHRzKSB7XG4gIGNvbnN0IHNob3dzID0gZ2V0U2hvd3Mob3B0cywgJ2FueScpXG4gIGluamVjdFN0eWxlKGZpbHRlckNzcyhzaG93cyksIGRvY3VtZW50LCAncGxheWVycy1maWx0ZXInKVxufVxuXG5leHBvcnRzLmZpbHRlclBsYXllciA9IGZ1bmN0aW9uIGZpbHRlclBsYXllciAob3B0cykge1xuICBjb25zdCBzaG93cyA9IGdldFNob3dzKG9wdHMsIG9wdHMud2hvKVxuICBpbmplY3RTdHlsZShmaWx0ZXJDc3Moc2hvd3MpLCBkb2N1bWVudCwgJ3BsYXllci1maWx0ZXInKVxufVxuXG5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uIHJlbmRlciAoYW5hbHl6ZWQpIHtcbiAgY29uc3QgcmVuZGVyID0ge1xuICAgICAgaW5mbyAgICA6IHJlbmRlckluZm8oYW5hbHl6ZWQuaW5mbywgYW5hbHl6ZWQucGxheWVycylcbiAgICAsIHRhYmxlICAgOiBhbmFseXplZC50YWJsZVxuICAgICwgYm9hcmQgICA6IHJlbmRlckNhcmRzKGFuYWx5emVkLmJvYXJkKVxuICAgICwgcGxheWVycyA6IGFuYWx5emVkLnBsYXllcnMubWFwKHJlbmRlclBsYXllcilcbiAgfVxuICBpbnNwZWN0KHJlbmRlcilcbiAgcmV0dXJuIGhvbGRlbShyZW5kZXIpXG59XG5cbmV4cG9ydHMucGFnZWlmeSA9IGZ1bmN0aW9uIHBhZ2VpZnkgKHJlbmRlcmVkSGFuZHMpIHtcbiAgY29uc3QgaHRtbCA9XG4gICAgICBoZWFkXG4gICAgKyAnPGJvZHk+J1xuICAgICAgKyByZW5kZXJlZEhhbmRzXG4gICAgKyAnPC9ib2R5PidcbiAgcmV0dXJuIGh0bWxcbn1cblxuLy8gVGVzdFxuLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLXZhcnMgKi9cbmZ1bmN0aW9uIGluc3BlY3QgKG9iaiwgZGVwdGgpIHtcbiAgY29uc29sZS5lcnJvcihyZXF1aXJlKCd1dGlsJykuaW5zcGVjdChvYmosIGZhbHNlLCBkZXB0aCB8fCA1LCB0cnVlKSlcbn1cbmlmICghbW9kdWxlLnBhcmVudCAmJiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG5cbmNvbnN0IGFjdGlvbm9uYWxsID0gZXhwb3J0cy5yZW5kZXIocmVxdWlyZSgnLi90ZXN0L2ZpeHR1cmVzL2hvbGRlbS9hY3Rpb25vbmFsbC5qc29uJykpXG5jb25zdCBhbGxpbiA9IGV4cG9ydHMucmVuZGVyKHJlcXVpcmUoJy4vdGVzdC9maXh0dXJlcy9ob2xkZW0vYWxsaW4tcHJlZmxvcC5qc29uJykpXG5jb25zdCBodG1sID0gZXhwb3J0cy5wYWdlaWZ5KGFjdGlvbm9uYWxsICsgYWxsaW4pXG4vLyBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihfX2Rpcm5hbWUsICd0ZXN0Lmh0bWwnKSwgaHRtbCwgJ3V0ZjgnKVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgY29tbWEtc3R5bGUsIG9wZXJhdG9yLWxpbmVicmVhaywgc3BhY2UtdW5hcnktb3BzLCBuby1tdWx0aS1zcGFjZXMsIGtleS1zcGFjaW5nLCBpbmRlbnQgKi9cbid1c2Ugc3RyaWN0J1xuXG5jb25zdCBoYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpXG5jb25zdCBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJylcbmhlbHBlcnMoaGFuZGxlYmFycylcblxuZXhwb3J0cy5oZWFkICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvaGVhZC5oYnMnKVxuZXhwb3J0cy5jc3MgICAgICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvc3R5bGUuaGJzJylcbmV4cG9ydHMuZmlsdGVyQ3NzID0gcmVxdWlyZSgnLi4vdGVtcGxhdGVzL3N0eWxlLWZpbHRlci5oYnMnKVxuZXhwb3J0cy5ob2xkZW0gICAgPSByZXF1aXJlKCcuLi90ZW1wbGF0ZXMvaG9sZGVtLmhicycpXG4iLCIndXNlIHN0cmljdCdcblxuZnVuY3Rpb24gdHdvRGlnaXRzIChuKSB7XG4gIHJldHVybiAoJzAnICsgbikuc2xpY2UoLTIpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaGVscGVycyAoaGFuZGxlYmFycykge1xuICBoYW5kbGViYXJzLnJlZ2lzdGVySGVscGVyKCdpZnZhbHVlJywgZnVuY3Rpb24gKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMuaGFzaC52YWx1ZSA9PT0gY29uZGl0aW9uYWwpIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmZuKHRoaXMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmludmVyc2UodGhpcylcbiAgICB9XG4gIH0pXG4gIGhhbmRsZWJhcnMucmVnaXN0ZXJIZWxwZXIoJ3R3b2RpZ2l0cycsIGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgcmV0dXJuIHR3b0RpZ2l0cyhvcHRpb25zLmZuKHRoaXMpKVxuICB9KVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbmZ1bmN0aW9uIGluamVjdFN0eWxlVGFnIChkb2N1bWVudCwgaWQpIHtcbiAgbGV0IHN0eWxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpXG5cbiAgaWYgKCFzdHlsZSkge1xuICAgIGNvbnN0IGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdXG4gICAgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpXG4gICAgaWYgKGlkICE9IG51bGwpIHN0eWxlLmlkID0gaWRcbiAgICBoZWFkLmFwcGVuZENoaWxkKHN0eWxlKVxuICB9XG5cbiAgcmV0dXJuIHN0eWxlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5qZWN0U3R5bGUgKGNzcywgZG9jdW1lbnQsIGlkKSB7XG4gIGNvbnN0IHN0eWxlID0gaW5qZWN0U3R5bGVUYWcoZG9jdW1lbnQsIGlkKVxuICBpZiAoc3R5bGUuc3R5bGVTaGVldCkge1xuICAgIHN0eWxlLnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzc1xuICB9IGVsc2Uge1xuICAgIHN0eWxlLmlubmVySFRNTCA9IGNzc1xuICB9XG59XG4iLCIiLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuIiwiaW1wb3J0ICogYXMgYmFzZSBmcm9tICcuL2hhbmRsZWJhcnMvYmFzZSc7XG5cbi8vIEVhY2ggb2YgdGhlc2UgYXVnbWVudCB0aGUgSGFuZGxlYmFycyBvYmplY3QuIE5vIG5lZWQgdG8gc2V0dXAgaGVyZS5cbi8vIChUaGlzIGlzIGRvbmUgdG8gZWFzaWx5IHNoYXJlIGNvZGUgYmV0d2VlbiBjb21tb25qcyBhbmQgYnJvd3NlIGVudnMpXG5pbXBvcnQgU2FmZVN0cmluZyBmcm9tICcuL2hhbmRsZWJhcnMvc2FmZS1zdHJpbmcnO1xuaW1wb3J0IEV4Y2VwdGlvbiBmcm9tICcuL2hhbmRsZWJhcnMvZXhjZXB0aW9uJztcbmltcG9ydCAqIGFzIFV0aWxzIGZyb20gJy4vaGFuZGxlYmFycy91dGlscyc7XG5pbXBvcnQgKiBhcyBydW50aW1lIGZyb20gJy4vaGFuZGxlYmFycy9ydW50aW1lJztcblxuaW1wb3J0IG5vQ29uZmxpY3QgZnJvbSAnLi9oYW5kbGViYXJzL25vLWNvbmZsaWN0JztcblxuLy8gRm9yIGNvbXBhdGliaWxpdHkgYW5kIHVzYWdlIG91dHNpZGUgb2YgbW9kdWxlIHN5c3RlbXMsIG1ha2UgdGhlIEhhbmRsZWJhcnMgb2JqZWN0IGEgbmFtZXNwYWNlXG5mdW5jdGlvbiBjcmVhdGUoKSB7XG4gIGxldCBoYiA9IG5ldyBiYXNlLkhhbmRsZWJhcnNFbnZpcm9ubWVudCgpO1xuXG4gIFV0aWxzLmV4dGVuZChoYiwgYmFzZSk7XG4gIGhiLlNhZmVTdHJpbmcgPSBTYWZlU3RyaW5nO1xuICBoYi5FeGNlcHRpb24gPSBFeGNlcHRpb247XG4gIGhiLlV0aWxzID0gVXRpbHM7XG4gIGhiLmVzY2FwZUV4cHJlc3Npb24gPSBVdGlscy5lc2NhcGVFeHByZXNzaW9uO1xuXG4gIGhiLlZNID0gcnVudGltZTtcbiAgaGIudGVtcGxhdGUgPSBmdW5jdGlvbihzcGVjKSB7XG4gICAgcmV0dXJuIHJ1bnRpbWUudGVtcGxhdGUoc3BlYywgaGIpO1xuICB9O1xuXG4gIHJldHVybiBoYjtcbn1cblxubGV0IGluc3QgPSBjcmVhdGUoKTtcbmluc3QuY3JlYXRlID0gY3JlYXRlO1xuXG5ub0NvbmZsaWN0KGluc3QpO1xuXG5pbnN0WydkZWZhdWx0J10gPSBpbnN0O1xuXG5leHBvcnQgZGVmYXVsdCBpbnN0O1xuIiwiaW1wb3J0IHtjcmVhdGVGcmFtZSwgZXh0ZW5kLCB0b1N0cmluZ30gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgRXhjZXB0aW9uIGZyb20gJy4vZXhjZXB0aW9uJztcbmltcG9ydCB7cmVnaXN0ZXJEZWZhdWx0SGVscGVyc30gZnJvbSAnLi9oZWxwZXJzJztcbmltcG9ydCB7cmVnaXN0ZXJEZWZhdWx0RGVjb3JhdG9yc30gZnJvbSAnLi9kZWNvcmF0b3JzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVkVSU0lPTiA9ICc0LjAuNSc7XG5leHBvcnQgY29uc3QgQ09NUElMRVJfUkVWSVNJT04gPSA3O1xuXG5leHBvcnQgY29uc3QgUkVWSVNJT05fQ0hBTkdFUyA9IHtcbiAgMTogJzw9IDEuMC5yYy4yJywgLy8gMS4wLnJjLjIgaXMgYWN0dWFsbHkgcmV2MiBidXQgZG9lc24ndCByZXBvcnQgaXRcbiAgMjogJz09IDEuMC4wLXJjLjMnLFxuICAzOiAnPT0gMS4wLjAtcmMuNCcsXG4gIDQ6ICc9PSAxLngueCcsXG4gIDU6ICc9PSAyLjAuMC1hbHBoYS54JyxcbiAgNjogJz49IDIuMC4wLWJldGEuMScsXG4gIDc6ICc+PSA0LjAuMCdcbn07XG5cbmNvbnN0IG9iamVjdFR5cGUgPSAnW29iamVjdCBPYmplY3RdJztcblxuZXhwb3J0IGZ1bmN0aW9uIEhhbmRsZWJhcnNFbnZpcm9ubWVudChoZWxwZXJzLCBwYXJ0aWFscywgZGVjb3JhdG9ycykge1xuICB0aGlzLmhlbHBlcnMgPSBoZWxwZXJzIHx8IHt9O1xuICB0aGlzLnBhcnRpYWxzID0gcGFydGlhbHMgfHwge307XG4gIHRoaXMuZGVjb3JhdG9ycyA9IGRlY29yYXRvcnMgfHwge307XG5cbiAgcmVnaXN0ZXJEZWZhdWx0SGVscGVycyh0aGlzKTtcbiAgcmVnaXN0ZXJEZWZhdWx0RGVjb3JhdG9ycyh0aGlzKTtcbn1cblxuSGFuZGxlYmFyc0Vudmlyb25tZW50LnByb3RvdHlwZSA9IHtcbiAgY29uc3RydWN0b3I6IEhhbmRsZWJhcnNFbnZpcm9ubWVudCxcblxuICBsb2dnZXI6IGxvZ2dlcixcbiAgbG9nOiBsb2dnZXIubG9nLFxuXG4gIHJlZ2lzdGVySGVscGVyOiBmdW5jdGlvbihuYW1lLCBmbikge1xuICAgIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgICBpZiAoZm4pIHsgdGhyb3cgbmV3IEV4Y2VwdGlvbignQXJnIG5vdCBzdXBwb3J0ZWQgd2l0aCBtdWx0aXBsZSBoZWxwZXJzJyk7IH1cbiAgICAgIGV4dGVuZCh0aGlzLmhlbHBlcnMsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmhlbHBlcnNbbmFtZV0gPSBmbjtcbiAgICB9XG4gIH0sXG4gIHVucmVnaXN0ZXJIZWxwZXI6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBkZWxldGUgdGhpcy5oZWxwZXJzW25hbWVdO1xuICB9LFxuXG4gIHJlZ2lzdGVyUGFydGlhbDogZnVuY3Rpb24obmFtZSwgcGFydGlhbCkge1xuICAgIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgICBleHRlbmQodGhpcy5wYXJ0aWFscywgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0eXBlb2YgcGFydGlhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihgQXR0ZW1wdGluZyB0byByZWdpc3RlciBhIHBhcnRpYWwgY2FsbGVkIFwiJHtuYW1lfVwiIGFzIHVuZGVmaW5lZGApO1xuICAgICAgfVxuICAgICAgdGhpcy5wYXJ0aWFsc1tuYW1lXSA9IHBhcnRpYWw7XG4gICAgfVxuICB9LFxuICB1bnJlZ2lzdGVyUGFydGlhbDogZnVuY3Rpb24obmFtZSkge1xuICAgIGRlbGV0ZSB0aGlzLnBhcnRpYWxzW25hbWVdO1xuICB9LFxuXG4gIHJlZ2lzdGVyRGVjb3JhdG9yOiBmdW5jdGlvbihuYW1lLCBmbikge1xuICAgIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgICBpZiAoZm4pIHsgdGhyb3cgbmV3IEV4Y2VwdGlvbignQXJnIG5vdCBzdXBwb3J0ZWQgd2l0aCBtdWx0aXBsZSBkZWNvcmF0b3JzJyk7IH1cbiAgICAgIGV4dGVuZCh0aGlzLmRlY29yYXRvcnMsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmRlY29yYXRvcnNbbmFtZV0gPSBmbjtcbiAgICB9XG4gIH0sXG4gIHVucmVnaXN0ZXJEZWNvcmF0b3I6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBkZWxldGUgdGhpcy5kZWNvcmF0b3JzW25hbWVdO1xuICB9XG59O1xuXG5leHBvcnQgbGV0IGxvZyA9IGxvZ2dlci5sb2c7XG5cbmV4cG9ydCB7Y3JlYXRlRnJhbWUsIGxvZ2dlcn07XG4iLCJpbXBvcnQgcmVnaXN0ZXJJbmxpbmUgZnJvbSAnLi9kZWNvcmF0b3JzL2lubGluZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRlZmF1bHREZWNvcmF0b3JzKGluc3RhbmNlKSB7XG4gIHJlZ2lzdGVySW5saW5lKGluc3RhbmNlKTtcbn1cblxuIiwiaW1wb3J0IHtleHRlbmR9IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJEZWNvcmF0b3IoJ2lubGluZScsIGZ1bmN0aW9uKGZuLCBwcm9wcywgY29udGFpbmVyLCBvcHRpb25zKSB7XG4gICAgbGV0IHJldCA9IGZuO1xuICAgIGlmICghcHJvcHMucGFydGlhbHMpIHtcbiAgICAgIHByb3BzLnBhcnRpYWxzID0ge307XG4gICAgICByZXQgPSBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgICAgIC8vIENyZWF0ZSBhIG5ldyBwYXJ0aWFscyBzdGFjayBmcmFtZSBwcmlvciB0byBleGVjLlxuICAgICAgICBsZXQgb3JpZ2luYWwgPSBjb250YWluZXIucGFydGlhbHM7XG4gICAgICAgIGNvbnRhaW5lci5wYXJ0aWFscyA9IGV4dGVuZCh7fSwgb3JpZ2luYWwsIHByb3BzLnBhcnRpYWxzKTtcbiAgICAgICAgbGV0IHJldCA9IGZuKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgICAgICBjb250YWluZXIucGFydGlhbHMgPSBvcmlnaW5hbDtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcHJvcHMucGFydGlhbHNbb3B0aW9ucy5hcmdzWzBdXSA9IG9wdGlvbnMuZm47XG5cbiAgICByZXR1cm4gcmV0O1xuICB9KTtcbn1cbiIsIlxuY29uc3QgZXJyb3JQcm9wcyA9IFsnZGVzY3JpcHRpb24nLCAnZmlsZU5hbWUnLCAnbGluZU51bWJlcicsICdtZXNzYWdlJywgJ25hbWUnLCAnbnVtYmVyJywgJ3N0YWNrJ107XG5cbmZ1bmN0aW9uIEV4Y2VwdGlvbihtZXNzYWdlLCBub2RlKSB7XG4gIGxldCBsb2MgPSBub2RlICYmIG5vZGUubG9jLFxuICAgICAgbGluZSxcbiAgICAgIGNvbHVtbjtcbiAgaWYgKGxvYykge1xuICAgIGxpbmUgPSBsb2Muc3RhcnQubGluZTtcbiAgICBjb2x1bW4gPSBsb2Muc3RhcnQuY29sdW1uO1xuXG4gICAgbWVzc2FnZSArPSAnIC0gJyArIGxpbmUgKyAnOicgKyBjb2x1bW47XG4gIH1cblxuICBsZXQgdG1wID0gRXJyb3IucHJvdG90eXBlLmNvbnN0cnVjdG9yLmNhbGwodGhpcywgbWVzc2FnZSk7XG5cbiAgLy8gVW5mb3J0dW5hdGVseSBlcnJvcnMgYXJlIG5vdCBlbnVtZXJhYmxlIGluIENocm9tZSAoYXQgbGVhc3QpLCBzbyBgZm9yIHByb3AgaW4gdG1wYCBkb2Vzbid0IHdvcmsuXG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IGVycm9yUHJvcHMubGVuZ3RoOyBpZHgrKykge1xuICAgIHRoaXNbZXJyb3JQcm9wc1tpZHhdXSA9IHRtcFtlcnJvclByb3BzW2lkeF1dO1xuICB9XG5cbiAgLyogaXN0YW5idWwgaWdub3JlIGVsc2UgKi9cbiAgaWYgKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgRXhjZXB0aW9uKTtcbiAgfVxuXG4gIGlmIChsb2MpIHtcbiAgICB0aGlzLmxpbmVOdW1iZXIgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uID0gY29sdW1uO1xuICB9XG59XG5cbkV4Y2VwdGlvbi5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcblxuZXhwb3J0IGRlZmF1bHQgRXhjZXB0aW9uO1xuIiwiaW1wb3J0IHJlZ2lzdGVyQmxvY2tIZWxwZXJNaXNzaW5nIGZyb20gJy4vaGVscGVycy9ibG9jay1oZWxwZXItbWlzc2luZyc7XG5pbXBvcnQgcmVnaXN0ZXJFYWNoIGZyb20gJy4vaGVscGVycy9lYWNoJztcbmltcG9ydCByZWdpc3RlckhlbHBlck1pc3NpbmcgZnJvbSAnLi9oZWxwZXJzL2hlbHBlci1taXNzaW5nJztcbmltcG9ydCByZWdpc3RlcklmIGZyb20gJy4vaGVscGVycy9pZic7XG5pbXBvcnQgcmVnaXN0ZXJMb2cgZnJvbSAnLi9oZWxwZXJzL2xvZyc7XG5pbXBvcnQgcmVnaXN0ZXJMb29rdXAgZnJvbSAnLi9oZWxwZXJzL2xvb2t1cCc7XG5pbXBvcnQgcmVnaXN0ZXJXaXRoIGZyb20gJy4vaGVscGVycy93aXRoJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRGVmYXVsdEhlbHBlcnMoaW5zdGFuY2UpIHtcbiAgcmVnaXN0ZXJCbG9ja0hlbHBlck1pc3NpbmcoaW5zdGFuY2UpO1xuICByZWdpc3RlckVhY2goaW5zdGFuY2UpO1xuICByZWdpc3RlckhlbHBlck1pc3NpbmcoaW5zdGFuY2UpO1xuICByZWdpc3RlcklmKGluc3RhbmNlKTtcbiAgcmVnaXN0ZXJMb2coaW5zdGFuY2UpO1xuICByZWdpc3Rlckxvb2t1cChpbnN0YW5jZSk7XG4gIHJlZ2lzdGVyV2l0aChpbnN0YW5jZSk7XG59XG4iLCJpbXBvcnQge2FwcGVuZENvbnRleHRQYXRoLCBjcmVhdGVGcmFtZSwgaXNBcnJheX0gZnJvbSAnLi4vdXRpbHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignYmxvY2tIZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIGxldCBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlLFxuICAgICAgICBmbiA9IG9wdGlvbnMuZm47XG5cbiAgICBpZiAoY29udGV4dCA9PT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuIGZuKHRoaXMpO1xuICAgIH0gZWxzZSBpZiAoY29udGV4dCA9PT0gZmFsc2UgfHwgY29udGV4dCA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gaW52ZXJzZSh0aGlzKTtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkoY29udGV4dCkpIHtcbiAgICAgIGlmIChjb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuaWRzKSB7XG4gICAgICAgICAgb3B0aW9ucy5pZHMgPSBbb3B0aW9ucy5uYW1lXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbnN0YW5jZS5oZWxwZXJzLmVhY2goY29udGV4dCwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gaW52ZXJzZSh0aGlzKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLmlkcykge1xuICAgICAgICBsZXQgZGF0YSA9IGNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gICAgICAgIGRhdGEuY29udGV4dFBhdGggPSBhcHBlbmRDb250ZXh0UGF0aChvcHRpb25zLmRhdGEuY29udGV4dFBhdGgsIG9wdGlvbnMubmFtZSk7XG4gICAgICAgIG9wdGlvbnMgPSB7ZGF0YTogZGF0YX07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmbihjb250ZXh0LCBvcHRpb25zKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiaW1wb3J0IHthcHBlbmRDb250ZXh0UGF0aCwgYmxvY2tQYXJhbXMsIGNyZWF0ZUZyYW1lLCBpc0FycmF5LCBpc0Z1bmN0aW9ufSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgRXhjZXB0aW9uIGZyb20gJy4uL2V4Y2VwdGlvbic7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdlYWNoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignTXVzdCBwYXNzIGl0ZXJhdG9yIHRvICNlYWNoJyk7XG4gICAgfVxuXG4gICAgbGV0IGZuID0gb3B0aW9ucy5mbixcbiAgICAgICAgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZSxcbiAgICAgICAgaSA9IDAsXG4gICAgICAgIHJldCA9ICcnLFxuICAgICAgICBkYXRhLFxuICAgICAgICBjb250ZXh0UGF0aDtcblxuICAgIGlmIChvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5pZHMpIHtcbiAgICAgIGNvbnRleHRQYXRoID0gYXBwZW5kQ29udGV4dFBhdGgob3B0aW9ucy5kYXRhLmNvbnRleHRQYXRoLCBvcHRpb25zLmlkc1swXSkgKyAnLic7XG4gICAgfVxuXG4gICAgaWYgKGlzRnVuY3Rpb24oY29udGV4dCkpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gICAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgICAgZGF0YSA9IGNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXhlY0l0ZXJhdGlvbihmaWVsZCwgaW5kZXgsIGxhc3QpIHtcbiAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGRhdGEua2V5ID0gZmllbGQ7XG4gICAgICAgIGRhdGEuaW5kZXggPSBpbmRleDtcbiAgICAgICAgZGF0YS5maXJzdCA9IGluZGV4ID09PSAwO1xuICAgICAgICBkYXRhLmxhc3QgPSAhIWxhc3Q7XG5cbiAgICAgICAgaWYgKGNvbnRleHRQYXRoKSB7XG4gICAgICAgICAgZGF0YS5jb250ZXh0UGF0aCA9IGNvbnRleHRQYXRoICsgZmllbGQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtmaWVsZF0sIHtcbiAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgYmxvY2tQYXJhbXM6IGJsb2NrUGFyYW1zKFtjb250ZXh0W2ZpZWxkXSwgZmllbGRdLCBbY29udGV4dFBhdGggKyBmaWVsZCwgbnVsbF0pXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoY29udGV4dCAmJiB0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmIChpc0FycmF5KGNvbnRleHQpKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBjb250ZXh0Lmxlbmd0aDsgaSA8IGo7IGkrKykge1xuICAgICAgICAgIGlmIChpIGluIGNvbnRleHQpIHtcbiAgICAgICAgICAgIGV4ZWNJdGVyYXRpb24oaSwgaSwgaSA9PT0gY29udGV4dC5sZW5ndGggLSAxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCBwcmlvcktleTtcblxuICAgICAgICBmb3IgKGxldCBrZXkgaW4gY29udGV4dCkge1xuICAgICAgICAgIGlmIChjb250ZXh0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHJ1bm5pbmcgdGhlIGl0ZXJhdGlvbnMgb25lIHN0ZXAgb3V0IG9mIHN5bmMgc28gd2UgY2FuIGRldGVjdFxuICAgICAgICAgICAgLy8gdGhlIGxhc3QgaXRlcmF0aW9uIHdpdGhvdXQgaGF2ZSB0byBzY2FuIHRoZSBvYmplY3QgdHdpY2UgYW5kIGNyZWF0ZVxuICAgICAgICAgICAgLy8gYW4gaXRlcm1lZGlhdGUga2V5cyBhcnJheS5cbiAgICAgICAgICAgIGlmIChwcmlvcktleSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGV4ZWNJdGVyYXRpb24ocHJpb3JLZXksIGkgLSAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHByaW9yS2V5ID0ga2V5O1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocHJpb3JLZXkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGV4ZWNJdGVyYXRpb24ocHJpb3JLZXksIGkgLSAxLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpID09PSAwKSB7XG4gICAgICByZXQgPSBpbnZlcnNlKHRoaXMpO1xuICAgIH1cblxuICAgIHJldHVybiByZXQ7XG4gIH0pO1xufVxuIiwiaW1wb3J0IEV4Y2VwdGlvbiBmcm9tICcuLi9leGNlcHRpb24nO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignaGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKC8qIFthcmdzLCBdb3B0aW9ucyAqLykge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAvLyBBIG1pc3NpbmcgZmllbGQgaW4gYSB7e2Zvb319IGNvbnN0cnVjdC5cbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFNvbWVvbmUgaXMgYWN0dWFsbHkgdHJ5aW5nIHRvIGNhbGwgc29tZXRoaW5nLCBibG93IHVwLlxuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignTWlzc2luZyBoZWxwZXI6IFwiJyArIGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV0ubmFtZSArICdcIicpO1xuICAgIH1cbiAgfSk7XG59XG4iLCJpbXBvcnQge2lzRW1wdHksIGlzRnVuY3Rpb259IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2lmJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihjb25kaXRpb25hbCkpIHsgY29uZGl0aW9uYWwgPSBjb25kaXRpb25hbC5jYWxsKHRoaXMpOyB9XG5cbiAgICAvLyBEZWZhdWx0IGJlaGF2aW9yIGlzIHRvIHJlbmRlciB0aGUgcG9zaXRpdmUgcGF0aCBpZiB0aGUgdmFsdWUgaXMgdHJ1dGh5IGFuZCBub3QgZW1wdHkuXG4gICAgLy8gVGhlIGBpbmNsdWRlWmVyb2Agb3B0aW9uIG1heSBiZSBzZXQgdG8gdHJlYXQgdGhlIGNvbmR0aW9uYWwgYXMgcHVyZWx5IG5vdCBlbXB0eSBiYXNlZCBvbiB0aGVcbiAgICAvLyBiZWhhdmlvciBvZiBpc0VtcHR5LiBFZmZlY3RpdmVseSB0aGlzIGRldGVybWluZXMgaWYgMCBpcyBoYW5kbGVkIGJ5IHRoZSBwb3NpdGl2ZSBwYXRoIG9yIG5lZ2F0aXZlLlxuICAgIGlmICgoIW9wdGlvbnMuaGFzaC5pbmNsdWRlWmVybyAmJiAhY29uZGl0aW9uYWwpIHx8IGlzRW1wdHkoY29uZGl0aW9uYWwpKSB7XG4gICAgICByZXR1cm4gb3B0aW9ucy5pbnZlcnNlKHRoaXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb3B0aW9ucy5mbih0aGlzKTtcbiAgICB9XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCd1bmxlc3MnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICAgIHJldHVybiBpbnN0YW5jZS5oZWxwZXJzWydpZiddLmNhbGwodGhpcywgY29uZGl0aW9uYWwsIHtmbjogb3B0aW9ucy5pbnZlcnNlLCBpbnZlcnNlOiBvcHRpb25zLmZuLCBoYXNoOiBvcHRpb25zLmhhc2h9KTtcbiAgfSk7XG59XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignbG9nJywgZnVuY3Rpb24oLyogbWVzc2FnZSwgb3B0aW9ucyAqLykge1xuICAgIGxldCBhcmdzID0gW3VuZGVmaW5lZF0sXG4gICAgICAgIG9wdGlvbnMgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgYXJncy5wdXNoKGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gMTtcbiAgICBpZiAob3B0aW9ucy5oYXNoLmxldmVsICE9IG51bGwpIHtcbiAgICAgIGxldmVsID0gb3B0aW9ucy5oYXNoLmxldmVsO1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuZGF0YS5sZXZlbCAhPSBudWxsKSB7XG4gICAgICBsZXZlbCA9IG9wdGlvbnMuZGF0YS5sZXZlbDtcbiAgICB9XG4gICAgYXJnc1swXSA9IGxldmVsO1xuXG4gICAgaW5zdGFuY2UubG9nKC4uLiBhcmdzKTtcbiAgfSk7XG59XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbihpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignbG9va3VwJywgZnVuY3Rpb24ob2JqLCBmaWVsZCkge1xuICAgIHJldHVybiBvYmogJiYgb2JqW2ZpZWxkXTtcbiAgfSk7XG59XG4iLCJpbXBvcnQge2FwcGVuZENvbnRleHRQYXRoLCBibG9ja1BhcmFtcywgY3JlYXRlRnJhbWUsIGlzRW1wdHksIGlzRnVuY3Rpb259IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ3dpdGgnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oY29udGV4dCkpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gICAgbGV0IGZuID0gb3B0aW9ucy5mbjtcblxuICAgIGlmICghaXNFbXB0eShjb250ZXh0KSkge1xuICAgICAgbGV0IGRhdGEgPSBvcHRpb25zLmRhdGE7XG4gICAgICBpZiAob3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuaWRzKSB7XG4gICAgICAgIGRhdGEgPSBjcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICAgICAgICBkYXRhLmNvbnRleHRQYXRoID0gYXBwZW5kQ29udGV4dFBhdGgob3B0aW9ucy5kYXRhLmNvbnRleHRQYXRoLCBvcHRpb25zLmlkc1swXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmbihjb250ZXh0LCB7XG4gICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgIGJsb2NrUGFyYW1zOiBibG9ja1BhcmFtcyhbY29udGV4dF0sIFtkYXRhICYmIGRhdGEuY29udGV4dFBhdGhdKVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmludmVyc2UodGhpcyk7XG4gICAgfVxuICB9KTtcbn1cbiIsImltcG9ydCB7aW5kZXhPZn0gZnJvbSAnLi91dGlscyc7XG5cbmxldCBsb2dnZXIgPSB7XG4gIG1ldGhvZE1hcDogWydkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXSxcbiAgbGV2ZWw6ICdpbmZvJyxcblxuICAvLyBNYXBzIGEgZ2l2ZW4gbGV2ZWwgdmFsdWUgdG8gdGhlIGBtZXRob2RNYXBgIGluZGV4ZXMgYWJvdmUuXG4gIGxvb2t1cExldmVsOiBmdW5jdGlvbihsZXZlbCkge1xuICAgIGlmICh0eXBlb2YgbGV2ZWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICBsZXQgbGV2ZWxNYXAgPSBpbmRleE9mKGxvZ2dlci5tZXRob2RNYXAsIGxldmVsLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgaWYgKGxldmVsTWFwID49IDApIHtcbiAgICAgICAgbGV2ZWwgPSBsZXZlbE1hcDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldmVsID0gcGFyc2VJbnQobGV2ZWwsIDEwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbGV2ZWw7XG4gIH0sXG5cbiAgLy8gQ2FuIGJlIG92ZXJyaWRkZW4gaW4gdGhlIGhvc3QgZW52aXJvbm1lbnRcbiAgbG9nOiBmdW5jdGlvbihsZXZlbCwgLi4ubWVzc2FnZSkge1xuICAgIGxldmVsID0gbG9nZ2VyLmxvb2t1cExldmVsKGxldmVsKTtcblxuICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbG9nZ2VyLmxvb2t1cExldmVsKGxvZ2dlci5sZXZlbCkgPD0gbGV2ZWwpIHtcbiAgICAgIGxldCBtZXRob2QgPSBsb2dnZXIubWV0aG9kTWFwW2xldmVsXTtcbiAgICAgIGlmICghY29uc29sZVttZXRob2RdKSB7ICAgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby1jb25zb2xlXG4gICAgICAgIG1ldGhvZCA9ICdsb2cnO1xuICAgICAgfVxuICAgICAgY29uc29sZVttZXRob2RdKC4uLm1lc3NhZ2UpOyAgICAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLWNvbnNvbGVcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IGxvZ2dlcjtcbiIsIi8qIGdsb2JhbCB3aW5kb3cgKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKEhhbmRsZWJhcnMpIHtcbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgbGV0IHJvb3QgPSB0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbCA6IHdpbmRvdyxcbiAgICAgICRIYW5kbGViYXJzID0gcm9vdC5IYW5kbGViYXJzO1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBIYW5kbGViYXJzLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAocm9vdC5IYW5kbGViYXJzID09PSBIYW5kbGViYXJzKSB7XG4gICAgICByb290LkhhbmRsZWJhcnMgPSAkSGFuZGxlYmFycztcbiAgICB9XG4gICAgcmV0dXJuIEhhbmRsZWJhcnM7XG4gIH07XG59XG4iLCJpbXBvcnQgKiBhcyBVdGlscyBmcm9tICcuL3V0aWxzJztcbmltcG9ydCBFeGNlcHRpb24gZnJvbSAnLi9leGNlcHRpb24nO1xuaW1wb3J0IHsgQ09NUElMRVJfUkVWSVNJT04sIFJFVklTSU9OX0NIQU5HRVMsIGNyZWF0ZUZyYW1lIH0gZnJvbSAnLi9iYXNlJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrUmV2aXNpb24oY29tcGlsZXJJbmZvKSB7XG4gIGNvbnN0IGNvbXBpbGVyUmV2aXNpb24gPSBjb21waWxlckluZm8gJiYgY29tcGlsZXJJbmZvWzBdIHx8IDEsXG4gICAgICAgIGN1cnJlbnRSZXZpc2lvbiA9IENPTVBJTEVSX1JFVklTSU9OO1xuXG4gIGlmIChjb21waWxlclJldmlzaW9uICE9PSBjdXJyZW50UmV2aXNpb24pIHtcbiAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiA8IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgY29uc3QgcnVudGltZVZlcnNpb25zID0gUkVWSVNJT05fQ0hBTkdFU1tjdXJyZW50UmV2aXNpb25dLFxuICAgICAgICAgICAgY29tcGlsZXJWZXJzaW9ucyA9IFJFVklTSU9OX0NIQU5HRVNbY29tcGlsZXJSZXZpc2lvbl07XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhbiBvbGRlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiAnICtcbiAgICAgICAgICAgICdQbGVhc2UgdXBkYXRlIHlvdXIgcHJlY29tcGlsZXIgdG8gYSBuZXdlciB2ZXJzaW9uICgnICsgcnVudGltZVZlcnNpb25zICsgJykgb3IgZG93bmdyYWRlIHlvdXIgcnVudGltZSB0byBhbiBvbGRlciB2ZXJzaW9uICgnICsgY29tcGlsZXJWZXJzaW9ucyArICcpLicpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVc2UgdGhlIGVtYmVkZGVkIHZlcnNpb24gaW5mbyBzaW5jZSB0aGUgcnVudGltZSBkb2Vzbid0IGtub3cgYWJvdXQgdGhpcyByZXZpc2lvbiB5ZXRcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1RlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGEgbmV3ZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gJyArXG4gICAgICAgICAgICAnUGxlYXNlIHVwZGF0ZSB5b3VyIHJ1bnRpbWUgdG8gYSBuZXdlciB2ZXJzaW9uICgnICsgY29tcGlsZXJJbmZvWzFdICsgJykuJyk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZW1wbGF0ZSh0ZW1wbGF0ZVNwZWMsIGVudikge1xuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICBpZiAoIWVudikge1xuICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ05vIGVudmlyb25tZW50IHBhc3NlZCB0byB0ZW1wbGF0ZScpO1xuICB9XG4gIGlmICghdGVtcGxhdGVTcGVjIHx8ICF0ZW1wbGF0ZVNwZWMubWFpbikge1xuICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1Vua25vd24gdGVtcGxhdGUgb2JqZWN0OiAnICsgdHlwZW9mIHRlbXBsYXRlU3BlYyk7XG4gIH1cblxuICB0ZW1wbGF0ZVNwZWMubWFpbi5kZWNvcmF0b3IgPSB0ZW1wbGF0ZVNwZWMubWFpbl9kO1xuXG4gIC8vIE5vdGU6IFVzaW5nIGVudi5WTSByZWZlcmVuY2VzIHJhdGhlciB0aGFuIGxvY2FsIHZhciByZWZlcmVuY2VzIHRocm91Z2hvdXQgdGhpcyBzZWN0aW9uIHRvIGFsbG93XG4gIC8vIGZvciBleHRlcm5hbCB1c2VycyB0byBvdmVycmlkZSB0aGVzZSBhcyBwc3VlZG8tc3VwcG9ydGVkIEFQSXMuXG4gIGVudi5WTS5jaGVja1JldmlzaW9uKHRlbXBsYXRlU3BlYy5jb21waWxlcik7XG5cbiAgZnVuY3Rpb24gaW52b2tlUGFydGlhbFdyYXBwZXIocGFydGlhbCwgY29udGV4dCwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLmhhc2gpIHtcbiAgICAgIGNvbnRleHQgPSBVdGlscy5leHRlbmQoe30sIGNvbnRleHQsIG9wdGlvbnMuaGFzaCk7XG4gICAgICBpZiAob3B0aW9ucy5pZHMpIHtcbiAgICAgICAgb3B0aW9ucy5pZHNbMF0gPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHBhcnRpYWwgPSBlbnYuVk0ucmVzb2x2ZVBhcnRpYWwuY2FsbCh0aGlzLCBwYXJ0aWFsLCBjb250ZXh0LCBvcHRpb25zKTtcbiAgICBsZXQgcmVzdWx0ID0gZW52LlZNLmludm9rZVBhcnRpYWwuY2FsbCh0aGlzLCBwYXJ0aWFsLCBjb250ZXh0LCBvcHRpb25zKTtcblxuICAgIGlmIChyZXN1bHQgPT0gbnVsbCAmJiBlbnYuY29tcGlsZSkge1xuICAgICAgb3B0aW9ucy5wYXJ0aWFsc1tvcHRpb25zLm5hbWVdID0gZW52LmNvbXBpbGUocGFydGlhbCwgdGVtcGxhdGVTcGVjLmNvbXBpbGVyT3B0aW9ucywgZW52KTtcbiAgICAgIHJlc3VsdCA9IG9wdGlvbnMucGFydGlhbHNbb3B0aW9ucy5uYW1lXShjb250ZXh0LCBvcHRpb25zKTtcbiAgICB9XG4gICAgaWYgKHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICBpZiAob3B0aW9ucy5pbmRlbnQpIHtcbiAgICAgICAgbGV0IGxpbmVzID0gcmVzdWx0LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGwgPSBsaW5lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICBpZiAoIWxpbmVzW2ldICYmIGkgKyAxID09PSBsKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsaW5lc1tpXSA9IG9wdGlvbnMuaW5kZW50ICsgbGluZXNbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0ID0gbGluZXMuam9pbignXFxuJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKCdUaGUgcGFydGlhbCAnICsgb3B0aW9ucy5uYW1lICsgJyBjb3VsZCBub3QgYmUgY29tcGlsZWQgd2hlbiBydW5uaW5nIGluIHJ1bnRpbWUtb25seSBtb2RlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gSnVzdCBhZGQgd2F0ZXJcbiAgbGV0IGNvbnRhaW5lciA9IHtcbiAgICBzdHJpY3Q6IGZ1bmN0aW9uKG9iaiwgbmFtZSkge1xuICAgICAgaWYgKCEobmFtZSBpbiBvYmopKSB7XG4gICAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1wiJyArIG5hbWUgKyAnXCIgbm90IGRlZmluZWQgaW4gJyArIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqW25hbWVdO1xuICAgIH0sXG4gICAgbG9va3VwOiBmdW5jdGlvbihkZXB0aHMsIG5hbWUpIHtcbiAgICAgIGNvbnN0IGxlbiA9IGRlcHRocy5sZW5ndGg7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChkZXB0aHNbaV0gJiYgZGVwdGhzW2ldW25hbWVdICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gZGVwdGhzW2ldW25hbWVdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBsYW1iZGE6IGZ1bmN0aW9uKGN1cnJlbnQsIGNvbnRleHQpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgY3VycmVudCA9PT0gJ2Z1bmN0aW9uJyA/IGN1cnJlbnQuY2FsbChjb250ZXh0KSA6IGN1cnJlbnQ7XG4gICAgfSxcblxuICAgIGVzY2FwZUV4cHJlc3Npb246IFV0aWxzLmVzY2FwZUV4cHJlc3Npb24sXG4gICAgaW52b2tlUGFydGlhbDogaW52b2tlUGFydGlhbFdyYXBwZXIsXG5cbiAgICBmbjogZnVuY3Rpb24oaSkge1xuICAgICAgbGV0IHJldCA9IHRlbXBsYXRlU3BlY1tpXTtcbiAgICAgIHJldC5kZWNvcmF0b3IgPSB0ZW1wbGF0ZVNwZWNbaSArICdfZCddO1xuICAgICAgcmV0dXJuIHJldDtcbiAgICB9LFxuXG4gICAgcHJvZ3JhbXM6IFtdLFxuICAgIHByb2dyYW06IGZ1bmN0aW9uKGksIGRhdGEsIGRlY2xhcmVkQmxvY2tQYXJhbXMsIGJsb2NrUGFyYW1zLCBkZXB0aHMpIHtcbiAgICAgIGxldCBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV0sXG4gICAgICAgICAgZm4gPSB0aGlzLmZuKGkpO1xuICAgICAgaWYgKGRhdGEgfHwgZGVwdGhzIHx8IGJsb2NrUGFyYW1zIHx8IGRlY2xhcmVkQmxvY2tQYXJhbXMpIHtcbiAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSB3cmFwUHJvZ3JhbSh0aGlzLCBpLCBmbiwgZGF0YSwgZGVjbGFyZWRCbG9ja1BhcmFtcywgYmxvY2tQYXJhbXMsIGRlcHRocyk7XG4gICAgICB9IGVsc2UgaWYgKCFwcm9ncmFtV3JhcHBlcikge1xuICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV0gPSB3cmFwUHJvZ3JhbSh0aGlzLCBpLCBmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVdyYXBwZXI7XG4gICAgfSxcblxuICAgIGRhdGE6IGZ1bmN0aW9uKHZhbHVlLCBkZXB0aCkge1xuICAgICAgd2hpbGUgKHZhbHVlICYmIGRlcHRoLS0pIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5fcGFyZW50O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0sXG4gICAgbWVyZ2U6IGZ1bmN0aW9uKHBhcmFtLCBjb21tb24pIHtcbiAgICAgIGxldCBvYmogPSBwYXJhbSB8fCBjb21tb247XG5cbiAgICAgIGlmIChwYXJhbSAmJiBjb21tb24gJiYgKHBhcmFtICE9PSBjb21tb24pKSB7XG4gICAgICAgIG9iaiA9IFV0aWxzLmV4dGVuZCh7fSwgY29tbW9uLCBwYXJhbSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfSxcblxuICAgIG5vb3A6IGVudi5WTS5ub29wLFxuICAgIGNvbXBpbGVySW5mbzogdGVtcGxhdGVTcGVjLmNvbXBpbGVyXG4gIH07XG5cbiAgZnVuY3Rpb24gcmV0KGNvbnRleHQsIG9wdGlvbnMgPSB7fSkge1xuICAgIGxldCBkYXRhID0gb3B0aW9ucy5kYXRhO1xuXG4gICAgcmV0Ll9zZXR1cChvcHRpb25zKTtcbiAgICBpZiAoIW9wdGlvbnMucGFydGlhbCAmJiB0ZW1wbGF0ZVNwZWMudXNlRGF0YSkge1xuICAgICAgZGF0YSA9IGluaXREYXRhKGNvbnRleHQsIGRhdGEpO1xuICAgIH1cbiAgICBsZXQgZGVwdGhzLFxuICAgICAgICBibG9ja1BhcmFtcyA9IHRlbXBsYXRlU3BlYy51c2VCbG9ja1BhcmFtcyA/IFtdIDogdW5kZWZpbmVkO1xuICAgIGlmICh0ZW1wbGF0ZVNwZWMudXNlRGVwdGhzKSB7XG4gICAgICBpZiAob3B0aW9ucy5kZXB0aHMpIHtcbiAgICAgICAgZGVwdGhzID0gY29udGV4dCAhPT0gb3B0aW9ucy5kZXB0aHNbMF0gPyBbY29udGV4dF0uY29uY2F0KG9wdGlvbnMuZGVwdGhzKSA6IG9wdGlvbnMuZGVwdGhzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVwdGhzID0gW2NvbnRleHRdO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1haW4oY29udGV4dC8qLCBvcHRpb25zKi8pIHtcbiAgICAgIHJldHVybiAnJyArIHRlbXBsYXRlU3BlYy5tYWluKGNvbnRhaW5lciwgY29udGV4dCwgY29udGFpbmVyLmhlbHBlcnMsIGNvbnRhaW5lci5wYXJ0aWFscywgZGF0YSwgYmxvY2tQYXJhbXMsIGRlcHRocyk7XG4gICAgfVxuICAgIG1haW4gPSBleGVjdXRlRGVjb3JhdG9ycyh0ZW1wbGF0ZVNwZWMubWFpbiwgbWFpbiwgY29udGFpbmVyLCBvcHRpb25zLmRlcHRocyB8fCBbXSwgZGF0YSwgYmxvY2tQYXJhbXMpO1xuICAgIHJldHVybiBtYWluKGNvbnRleHQsIG9wdGlvbnMpO1xuICB9XG4gIHJldC5pc1RvcCA9IHRydWU7XG5cbiAgcmV0Ll9zZXR1cCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMucGFydGlhbCkge1xuICAgICAgY29udGFpbmVyLmhlbHBlcnMgPSBjb250YWluZXIubWVyZ2Uob3B0aW9ucy5oZWxwZXJzLCBlbnYuaGVscGVycyk7XG5cbiAgICAgIGlmICh0ZW1wbGF0ZVNwZWMudXNlUGFydGlhbCkge1xuICAgICAgICBjb250YWluZXIucGFydGlhbHMgPSBjb250YWluZXIubWVyZ2Uob3B0aW9ucy5wYXJ0aWFscywgZW52LnBhcnRpYWxzKTtcbiAgICAgIH1cbiAgICAgIGlmICh0ZW1wbGF0ZVNwZWMudXNlUGFydGlhbCB8fCB0ZW1wbGF0ZVNwZWMudXNlRGVjb3JhdG9ycykge1xuICAgICAgICBjb250YWluZXIuZGVjb3JhdG9ycyA9IGNvbnRhaW5lci5tZXJnZShvcHRpb25zLmRlY29yYXRvcnMsIGVudi5kZWNvcmF0b3JzKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyLmhlbHBlcnMgPSBvcHRpb25zLmhlbHBlcnM7XG4gICAgICBjb250YWluZXIucGFydGlhbHMgPSBvcHRpb25zLnBhcnRpYWxzO1xuICAgICAgY29udGFpbmVyLmRlY29yYXRvcnMgPSBvcHRpb25zLmRlY29yYXRvcnM7XG4gICAgfVxuICB9O1xuXG4gIHJldC5fY2hpbGQgPSBmdW5jdGlvbihpLCBkYXRhLCBibG9ja1BhcmFtcywgZGVwdGhzKSB7XG4gICAgaWYgKHRlbXBsYXRlU3BlYy51c2VCbG9ja1BhcmFtcyAmJiAhYmxvY2tQYXJhbXMpIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ211c3QgcGFzcyBibG9jayBwYXJhbXMnKTtcbiAgICB9XG4gICAgaWYgKHRlbXBsYXRlU3BlYy51c2VEZXB0aHMgJiYgIWRlcHRocykge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbignbXVzdCBwYXNzIHBhcmVudCBkZXB0aHMnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gd3JhcFByb2dyYW0oY29udGFpbmVyLCBpLCB0ZW1wbGF0ZVNwZWNbaV0sIGRhdGEsIDAsIGJsb2NrUGFyYW1zLCBkZXB0aHMpO1xuICB9O1xuICByZXR1cm4gcmV0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JhcFByb2dyYW0oY29udGFpbmVyLCBpLCBmbiwgZGF0YSwgZGVjbGFyZWRCbG9ja1BhcmFtcywgYmxvY2tQYXJhbXMsIGRlcHRocykge1xuICBmdW5jdGlvbiBwcm9nKGNvbnRleHQsIG9wdGlvbnMgPSB7fSkge1xuICAgIGxldCBjdXJyZW50RGVwdGhzID0gZGVwdGhzO1xuICAgIGlmIChkZXB0aHMgJiYgY29udGV4dCAhPT0gZGVwdGhzWzBdKSB7XG4gICAgICBjdXJyZW50RGVwdGhzID0gW2NvbnRleHRdLmNvbmNhdChkZXB0aHMpO1xuICAgIH1cblxuICAgIHJldHVybiBmbihjb250YWluZXIsXG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGNvbnRhaW5lci5oZWxwZXJzLCBjb250YWluZXIucGFydGlhbHMsXG4gICAgICAgIG9wdGlvbnMuZGF0YSB8fCBkYXRhLFxuICAgICAgICBibG9ja1BhcmFtcyAmJiBbb3B0aW9ucy5ibG9ja1BhcmFtc10uY29uY2F0KGJsb2NrUGFyYW1zKSxcbiAgICAgICAgY3VycmVudERlcHRocyk7XG4gIH1cblxuICBwcm9nID0gZXhlY3V0ZURlY29yYXRvcnMoZm4sIHByb2csIGNvbnRhaW5lciwgZGVwdGhzLCBkYXRhLCBibG9ja1BhcmFtcyk7XG5cbiAgcHJvZy5wcm9ncmFtID0gaTtcbiAgcHJvZy5kZXB0aCA9IGRlcHRocyA/IGRlcHRocy5sZW5ndGggOiAwO1xuICBwcm9nLmJsb2NrUGFyYW1zID0gZGVjbGFyZWRCbG9ja1BhcmFtcyB8fCAwO1xuICByZXR1cm4gcHJvZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXJ0aWFsKHBhcnRpYWwsIGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgaWYgKCFwYXJ0aWFsKSB7XG4gICAgaWYgKG9wdGlvbnMubmFtZSA9PT0gJ0BwYXJ0aWFsLWJsb2NrJykge1xuICAgICAgcGFydGlhbCA9IG9wdGlvbnMuZGF0YVsncGFydGlhbC1ibG9jayddO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXJ0aWFsID0gb3B0aW9ucy5wYXJ0aWFsc1tvcHRpb25zLm5hbWVdO1xuICAgIH1cbiAgfSBlbHNlIGlmICghcGFydGlhbC5jYWxsICYmICFvcHRpb25zLm5hbWUpIHtcbiAgICAvLyBUaGlzIGlzIGEgZHluYW1pYyBwYXJ0aWFsIHRoYXQgcmV0dXJuZWQgYSBzdHJpbmdcbiAgICBvcHRpb25zLm5hbWUgPSBwYXJ0aWFsO1xuICAgIHBhcnRpYWwgPSBvcHRpb25zLnBhcnRpYWxzW3BhcnRpYWxdO1xuICB9XG4gIHJldHVybiBwYXJ0aWFsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW52b2tlUGFydGlhbChwYXJ0aWFsLCBjb250ZXh0LCBvcHRpb25zKSB7XG4gIG9wdGlvbnMucGFydGlhbCA9IHRydWU7XG4gIGlmIChvcHRpb25zLmlkcykge1xuICAgIG9wdGlvbnMuZGF0YS5jb250ZXh0UGF0aCA9IG9wdGlvbnMuaWRzWzBdIHx8IG9wdGlvbnMuZGF0YS5jb250ZXh0UGF0aDtcbiAgfVxuXG4gIGxldCBwYXJ0aWFsQmxvY2s7XG4gIGlmIChvcHRpb25zLmZuICYmIG9wdGlvbnMuZm4gIT09IG5vb3ApIHtcbiAgICBvcHRpb25zLmRhdGEgPSBjcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICAgIHBhcnRpYWxCbG9jayA9IG9wdGlvbnMuZGF0YVsncGFydGlhbC1ibG9jayddID0gb3B0aW9ucy5mbjtcblxuICAgIGlmIChwYXJ0aWFsQmxvY2sucGFydGlhbHMpIHtcbiAgICAgIG9wdGlvbnMucGFydGlhbHMgPSBVdGlscy5leHRlbmQoe30sIG9wdGlvbnMucGFydGlhbHMsIHBhcnRpYWxCbG9jay5wYXJ0aWFscyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBhcnRpYWwgPT09IHVuZGVmaW5lZCAmJiBwYXJ0aWFsQmxvY2spIHtcbiAgICBwYXJ0aWFsID0gcGFydGlhbEJsb2NrO1xuICB9XG5cbiAgaWYgKHBhcnRpYWwgPT09IHVuZGVmaW5lZCkge1xuICAgIHRocm93IG5ldyBFeGNlcHRpb24oJ1RoZSBwYXJ0aWFsICcgKyBvcHRpb25zLm5hbWUgKyAnIGNvdWxkIG5vdCBiZSBmb3VuZCcpO1xuICB9IGVsc2UgaWYgKHBhcnRpYWwgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgIHJldHVybiBwYXJ0aWFsKGNvbnRleHQsIG9wdGlvbnMpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub29wKCkgeyByZXR1cm4gJyc7IH1cblxuZnVuY3Rpb24gaW5pdERhdGEoY29udGV4dCwgZGF0YSkge1xuICBpZiAoIWRhdGEgfHwgISgncm9vdCcgaW4gZGF0YSkpIHtcbiAgICBkYXRhID0gZGF0YSA/IGNyZWF0ZUZyYW1lKGRhdGEpIDoge307XG4gICAgZGF0YS5yb290ID0gY29udGV4dDtcbiAgfVxuICByZXR1cm4gZGF0YTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZURlY29yYXRvcnMoZm4sIHByb2csIGNvbnRhaW5lciwgZGVwdGhzLCBkYXRhLCBibG9ja1BhcmFtcykge1xuICBpZiAoZm4uZGVjb3JhdG9yKSB7XG4gICAgbGV0IHByb3BzID0ge307XG4gICAgcHJvZyA9IGZuLmRlY29yYXRvcihwcm9nLCBwcm9wcywgY29udGFpbmVyLCBkZXB0aHMgJiYgZGVwdGhzWzBdLCBkYXRhLCBibG9ja1BhcmFtcywgZGVwdGhzKTtcbiAgICBVdGlscy5leHRlbmQocHJvZywgcHJvcHMpO1xuICB9XG4gIHJldHVybiBwcm9nO1xufVxuIiwiLy8gQnVpbGQgb3V0IG91ciBiYXNpYyBTYWZlU3RyaW5nIHR5cGVcbmZ1bmN0aW9uIFNhZmVTdHJpbmcoc3RyaW5nKSB7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xufVxuXG5TYWZlU3RyaW5nLnByb3RvdHlwZS50b1N0cmluZyA9IFNhZmVTdHJpbmcucHJvdG90eXBlLnRvSFRNTCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gJycgKyB0aGlzLnN0cmluZztcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFNhZmVTdHJpbmc7XG4iLCJjb25zdCBlc2NhcGUgPSB7XG4gICcmJzogJyZhbXA7JyxcbiAgJzwnOiAnJmx0OycsXG4gICc+JzogJyZndDsnLFxuICAnXCInOiAnJnF1b3Q7JyxcbiAgXCInXCI6ICcmI3gyNzsnLFxuICAnYCc6ICcmI3g2MDsnLFxuICAnPSc6ICcmI3gzRDsnXG59O1xuXG5jb25zdCBiYWRDaGFycyA9IC9bJjw+XCInYD1dL2csXG4gICAgICBwb3NzaWJsZSA9IC9bJjw+XCInYD1dLztcblxuZnVuY3Rpb24gZXNjYXBlQ2hhcihjaHIpIHtcbiAgcmV0dXJuIGVzY2FwZVtjaHJdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0ZW5kKG9iai8qICwgLi4uc291cmNlICovKSB7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQga2V5IGluIGFyZ3VtZW50c1tpXSkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChhcmd1bWVudHNbaV0sIGtleSkpIHtcbiAgICAgICAgb2JqW2tleV0gPSBhcmd1bWVudHNbaV1ba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufVxuXG5leHBvcnQgbGV0IHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLy8gU291cmNlZCBmcm9tIGxvZGFzaFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2Jlc3RpZWpzL2xvZGFzaC9ibG9iL21hc3Rlci9MSUNFTlNFLnR4dFxuLyogZXNsaW50LWRpc2FibGUgZnVuYy1zdHlsZSAqL1xubGV0IGlzRnVuY3Rpb24gPSBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xufTtcbi8vIGZhbGxiYWNrIGZvciBvbGRlciB2ZXJzaW9ucyBvZiBDaHJvbWUgYW5kIFNhZmFyaVxuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmlmIChpc0Z1bmN0aW9uKC94LykpIHtcbiAgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gJ1tvYmplY3QgRnVuY3Rpb25dJztcbiAgfTtcbn1cbmV4cG9ydCB7aXNGdW5jdGlvbn07XG4vKiBlc2xpbnQtZW5hYmxlIGZ1bmMtc3R5bGUgKi9cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmV4cG9ydCBjb25zdCBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpID8gdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEFycmF5XScgOiBmYWxzZTtcbn07XG5cbi8vIE9sZGVyIElFIHZlcnNpb25zIGRvIG5vdCBkaXJlY3RseSBzdXBwb3J0IGluZGV4T2Ygc28gd2UgbXVzdCBpbXBsZW1lbnQgb3VyIG93biwgc2FkbHkuXG5leHBvcnQgZnVuY3Rpb24gaW5kZXhPZihhcnJheSwgdmFsdWUpIHtcbiAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGFycmF5W2ldID09PSB2YWx1ZSkge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG4gIHJldHVybiAtMTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlRXhwcmVzc2lvbihzdHJpbmcpIHtcbiAgaWYgKHR5cGVvZiBzdHJpbmcgIT09ICdzdHJpbmcnKSB7XG4gICAgLy8gZG9uJ3QgZXNjYXBlIFNhZmVTdHJpbmdzLCBzaW5jZSB0aGV5J3JlIGFscmVhZHkgc2FmZVxuICAgIGlmIChzdHJpbmcgJiYgc3RyaW5nLnRvSFRNTCkge1xuICAgICAgcmV0dXJuIHN0cmluZy50b0hUTUwoKTtcbiAgICB9IGVsc2UgaWYgKHN0cmluZyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfSBlbHNlIGlmICghc3RyaW5nKSB7XG4gICAgICByZXR1cm4gc3RyaW5nICsgJyc7XG4gICAgfVxuXG4gICAgLy8gRm9yY2UgYSBzdHJpbmcgY29udmVyc2lvbiBhcyB0aGlzIHdpbGwgYmUgZG9uZSBieSB0aGUgYXBwZW5kIHJlZ2FyZGxlc3MgYW5kXG4gICAgLy8gdGhlIHJlZ2V4IHRlc3Qgd2lsbCBkbyB0aGlzIHRyYW5zcGFyZW50bHkgYmVoaW5kIHRoZSBzY2VuZXMsIGNhdXNpbmcgaXNzdWVzIGlmXG4gICAgLy8gYW4gb2JqZWN0J3MgdG8gc3RyaW5nIGhhcyBlc2NhcGVkIGNoYXJhY3RlcnMgaW4gaXQuXG4gICAgc3RyaW5nID0gJycgKyBzdHJpbmc7XG4gIH1cblxuICBpZiAoIXBvc3NpYmxlLnRlc3Qoc3RyaW5nKSkgeyByZXR1cm4gc3RyaW5nOyB9XG4gIHJldHVybiBzdHJpbmcucmVwbGFjZShiYWRDaGFycywgZXNjYXBlQ2hhcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgJiYgdmFsdWUgIT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChpc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZyYW1lKG9iamVjdCkge1xuICBsZXQgZnJhbWUgPSBleHRlbmQoe30sIG9iamVjdCk7XG4gIGZyYW1lLl9wYXJlbnQgPSBvYmplY3Q7XG4gIHJldHVybiBmcmFtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJsb2NrUGFyYW1zKHBhcmFtcywgaWRzKSB7XG4gIHBhcmFtcy5wYXRoID0gaWRzO1xuICByZXR1cm4gcGFyYW1zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kQ29udGV4dFBhdGgoY29udGV4dFBhdGgsIGlkKSB7XG4gIHJldHVybiAoY29udGV4dFBhdGggPyBjb250ZXh0UGF0aCArICcuJyA6ICcnKSArIGlkO1xufVxuIiwiLy8gQ3JlYXRlIGEgc2ltcGxlIHBhdGggYWxpYXMgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byByZXNvbHZlXG4vLyB0aGUgcnVudGltZSBvbiBhIHN1cHBvcnRlZCBwYXRoLlxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2Rpc3QvY2pzL2hhbmRsZWJhcnMucnVudGltZScpWydkZWZhdWx0J107XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJoYW5kbGViYXJzL3J1bnRpbWVcIilbXCJkZWZhdWx0XCJdO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnNDb21waWxlciA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFyc0NvbXBpbGVyLnRlbXBsYXRlKHtcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlcjtcblxuICByZXR1cm4gXCI8aGVhZD5cXG4gIDxtZXRhIGNoYXJzZXQ9XFxcInV0Zi04XFxcIj5cXG4gIDxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcImh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1JbmNvbnNvbGF0YVxcXCI+XFxuICA8c3R5bGUgdHlwZT1cXFwidGV4dC9jc3NcXFwiPlwiXG4gICAgKyAoKHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMuY3NzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5jc3MgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogaGVscGVycy5oZWxwZXJNaXNzaW5nKSwodHlwZW9mIGhlbHBlciA9PT0gXCJmdW5jdGlvblwiID8gaGVscGVyLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSx7XCJuYW1lXCI6XCJjc3NcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIjwvc3R5bGU+XFxuPC9oZWFkPlxcblwiO1xufSxcInVzZURhdGFcIjp0cnVlfSk7XG4iLCIvLyBoYnNmeSBjb21waWxlZCBIYW5kbGViYXJzIHRlbXBsYXRlXG52YXIgSGFuZGxlYmFyc0NvbXBpbGVyID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzQ29tcGlsZXIudGVtcGxhdGUoe1wiMVwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgICAgICAgIChcIlxuICAgICsgY29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb24oY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5hbnRlIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiKVxcblwiO1xufSxcIjNcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9O1xuXG4gIHJldHVybiBcIiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDEgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDQsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDIgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDYsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDMgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDgsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMSwoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDQgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDEwLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCJcXG4gICAgICBcIlxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuYm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQ1IDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxMiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuXCI7XG59LFwiNFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDEgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiIFwiO1xufSxcIjZcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiIFwiXG4gICAgKyAoKHN0YWNrMSA9IGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuYm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQyIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCI4XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBcIiBcIlxuICAgICsgKChzdGFjazEgPSBjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmJvYXJkIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMyA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgXCI7XG59LFwiMTBcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIFwiIFwiXG4gICAgKyAoKHN0YWNrMSA9IGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuYm9hcmQgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQ0IDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIiBcIjtcbn0sXCIxMlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMTtcblxuICByZXR1cm4gXCIgXCJcbiAgICArICgoc3RhY2sxID0gY29udGFpbmVyLmxhbWJkYSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5ib2FyZCA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuY2FyZDUgOiBzdGFjazEpLCBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiIFwiO1xufSxcIjE0XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIgICAgICAmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDtcXG5cIjtcbn0sXCIxNlwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgaGVscGVyLCBvcHRpb25zLCBhbGlhczE9ZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwgYWxpYXMyPWhlbHBlcnMuaGVscGVyTWlzc2luZywgYWxpYXMzPVwiZnVuY3Rpb25cIiwgYWxpYXM0PWhlbHBlcnMuYmxvY2tIZWxwZXJNaXNzaW5nLCBidWZmZXIgPSBcbiAgXCIgICAgPHNwYW4gY2xhc3M9XFxcImhodi1kYXRlXFxcIj5cXG4gICAgICBcIjtcbiAgc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy50d29kaWdpdHMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR3b2RpZ2l0cyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLChvcHRpb25zPXtcIm5hbWVcIjpcInR3b2RpZ2l0c1wiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxNywgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEsb3B0aW9ucykgOiBoZWxwZXIpKTtcbiAgaWYgKCFoZWxwZXJzLnR3b2RpZ2l0cykgeyBzdGFjazEgPSBhbGlhczQuY2FsbChkZXB0aDAsc3RhY2sxLG9wdGlvbnMpfVxuICBpZiAoc3RhY2sxICE9IG51bGwpIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCIvXCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMTksIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM0LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgcmV0dXJuIGJ1ZmZlciArIFwiL1wiXG4gICAgKyBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnllYXIgOiBzdGFjazEpLCBkZXB0aDApKVxuICAgICsgXCJcXG4gICAgPC9zcGFuPlxcblwiO1xufSxcIjE3XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLm1vbnRoIDogc3RhY2sxKSwgZGVwdGgwKSk7XG59LFwiMTlcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZGF5IDogc3RhY2sxKSwgZGVwdGgwKSk7XG59LFwiMjFcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuIGNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uKGNvbnRhaW5lci5sYW1iZGEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuaG91ciA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjIzXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLm1pbiA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjI1XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICB2YXIgc3RhY2sxO1xuXG4gIHJldHVybiBjb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbihjb250YWluZXIubGFtYmRhKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnNlYyA6IHN0YWNrMSksIGRlcHRoMCkpO1xufSxcIjI3XCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIgVDogXCI7XG59LFwiMjlcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazEsIGhlbHBlciwgYWxpYXMxPWRlcHRoMCAhPSBudWxsID8gZGVwdGgwIDoge30sIGFsaWFzMj1oZWxwZXJzLmhlbHBlck1pc3NpbmcsIGFsaWFzMz1cImZ1bmN0aW9uXCIsIGFsaWFzND1jb250YWluZXIuZXNjYXBlRXhwcmVzc2lvbiwgYWxpYXM1PWNvbnRhaW5lci5sYW1iZGE7XG5cbiAgcmV0dXJuIFwiICAgICAgPHRyXFxuICAgICAgICBjbGFzcz1cXFwiaGh2LXBsYXllciBcIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMubmFtZSB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAubmFtZSA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwibmFtZVwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgKChzdGFjazEgPSBoZWxwZXJzW1wiaWZcIl0uY2FsbChhbGlhczEsKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmludmVzdGVkIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgzMCwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoYWxpYXMxLChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5zYXdGbG9wIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgzMiwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxcIlxcbiAgICAgID5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucG9zIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5wb3MgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInBvc1wiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5uYW1lIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5uYW1lIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJuYW1lXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArICgoc3RhY2sxID0gYWxpYXM1KCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmNhcmRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5jYXJkMSA6IHN0YWNrMSksIGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgKChzdGFjazEgPSBhbGlhczUoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuY2FyZHMgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmNhcmQyIDogc3RhY2sxKSwgZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMSA6IFwiXCIpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLm0gfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLm0gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcIm1cIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucHJlZmxvcCB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAucHJlZmxvcCA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczIpLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczMgPyBoZWxwZXIuY2FsbChhbGlhczEse1wibmFtZVwiOlwicHJlZmxvcFwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5mbG9wIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5mbG9wIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJmbG9wXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgICA8dGQ+XCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR1cm4gfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR1cm4gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInR1cm5cIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiPC90ZD5cXG4gICAgICAgIDx0ZD5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMucml2ZXIgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnJpdmVyIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJyaXZlclwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCI8L3RkPlxcbiAgICAgICAgPHRkPlwiXG4gICAgKyBhbGlhczQoKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy5zaG93ZG93biB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuc2hvd2Rvd24gOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInNob3dkb3duXCIsXCJoYXNoXCI6e30sXCJkYXRhXCI6ZGF0YX0pIDogaGVscGVyKSkpXG4gICAgKyBcIjwvdGQ+XFxuICAgICAgPC90cj5cXG5cIjtcbn0sXCIzMFwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgcmV0dXJuIFwiIGludmVzdGVkXCI7XG59LFwiMzJcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHJldHVybiBcIiBzYXdGbG9wXCI7XG59LFwiY29tcGlsZXJcIjpbNyxcIj49IDQuMC4wXCJdLFwibWFpblwiOmZ1bmN0aW9uKGNvbnRhaW5lcixkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gICAgdmFyIHN0YWNrMSwgaGVscGVyLCBvcHRpb25zLCBhbGlhczE9Y29udGFpbmVyLmxhbWJkYSwgYWxpYXMyPWNvbnRhaW5lci5lc2NhcGVFeHByZXNzaW9uLCBhbGlhczM9ZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwgYWxpYXM0PWhlbHBlcnMuaGVscGVyTWlzc2luZywgYWxpYXM1PVwiZnVuY3Rpb25cIiwgYWxpYXM2PWhlbHBlcnMuYmxvY2tIZWxwZXJNaXNzaW5nLCBidWZmZXIgPSBcbiAgXCI8ZGl2IGNsYXNzPVxcXCJoaHYtaGFuZCBcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5hbnlBY3Rpdml0eSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIiBcIlxuICAgICsgYWxpYXMyKGFsaWFzMSgoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5wbGF5ZXJBY3Rpdml0eSA6IHN0YWNrMSksIGRlcHRoMCkpXG4gICAgKyBcIlxcXCI+XFxuICA8ZGl2IGNsYXNzPVxcXCJoaHYtaGVhZGVyXFxcIj5cXG4gICAgPHNwYW4gY2xhc3M9XFxcImhodi1iYi1zYi1hbnRlLW1heFxcXCI+XFxuICAgICAgKFwiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLmJiIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiL1wiXG4gICAgKyBhbGlhczIoYWxpYXMxKCgoc3RhY2sxID0gKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLmluZm8gOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLnNiIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiKVxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMywoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5hbnRlIDogc3RhY2sxKSx7XCJuYW1lXCI6XCJpZlwiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgxLCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgICBbXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudGFibGUgOiBkZXB0aDApKSAhPSBudWxsID8gc3RhY2sxLm1heHNlYXRzIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXVxcbiAgICA8L3NwYW4+XFxuICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtYm9hcmRcXFwiPlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMywoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuYm9hcmQgOiBkZXB0aDApLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDMsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5wcm9ncmFtKDE0LCBkYXRhLCAwKSxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgPC9zcGFuPlxcblwiXG4gICAgKyAoKHN0YWNrMSA9IGhlbHBlcnNbXCJpZlwiXS5jYWxsKGFsaWFzMywoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5kYXkgOiBzdGFjazEpLHtcIm5hbWVcIjpcImlmXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDE2LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgPHNwYW4gY2xhc3M9XFxcImhodi1kYXRlXFxcIj5cXG4gICAgICBcIjtcbiAgc3RhY2sxID0gKChoZWxwZXIgPSAoaGVscGVyID0gaGVscGVycy50d29kaWdpdHMgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnR3b2RpZ2l0cyA6IGRlcHRoMCkpICE9IG51bGwgPyBoZWxwZXIgOiBhbGlhczQpLChvcHRpb25zPXtcIm5hbWVcIjpcInR3b2RpZ2l0c1wiLFwiaGFzaFwiOnt9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgyMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pLCh0eXBlb2YgaGVscGVyID09PSBhbGlhczUgPyBoZWxwZXIuY2FsbChhbGlhczMsb3B0aW9ucykgOiBoZWxwZXIpKTtcbiAgaWYgKCFoZWxwZXJzLnR3b2RpZ2l0cykgeyBzdGFjazEgPSBhbGlhczYuY2FsbChkZXB0aDAsc3RhY2sxLG9wdGlvbnMpfVxuICBpZiAoc3RhY2sxICE9IG51bGwpIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCI6XCI7XG4gIHN0YWNrMSA9ICgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMudHdvZGlnaXRzIHx8IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC50d29kaWdpdHMgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXM0KSwob3B0aW9ucz17XCJuYW1lXCI6XCJ0d29kaWdpdHNcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMjMsIGRhdGEsIDApLFwiaW52ZXJzZVwiOmNvbnRhaW5lci5ub29wLFwiZGF0YVwiOmRhdGF9KSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXM1ID8gaGVscGVyLmNhbGwoYWxpYXMzLG9wdGlvbnMpIDogaGVscGVyKSk7XG4gIGlmICghaGVscGVycy50d29kaWdpdHMpIHsgc3RhY2sxID0gYWxpYXM2LmNhbGwoZGVwdGgwLHN0YWNrMSxvcHRpb25zKX1cbiAgaWYgKHN0YWNrMSAhPSBudWxsKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgYnVmZmVyICs9IFwiOlwiO1xuICBzdGFjazEgPSAoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnR3b2RpZ2l0cyB8fCAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAudHdvZGlnaXRzIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzNCksKG9wdGlvbnM9e1wibmFtZVwiOlwidHdvZGlnaXRzXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDI1LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzNSA/IGhlbHBlci5jYWxsKGFsaWFzMyxvcHRpb25zKSA6IGhlbHBlcikpO1xuICBpZiAoIWhlbHBlcnMudHdvZGlnaXRzKSB7IHN0YWNrMSA9IGFsaWFzNi5jYWxsKGRlcHRoMCxzdGFjazEsb3B0aW9ucyl9XG4gIGlmIChzdGFjazEgIT0gbnVsbCkgeyBidWZmZXIgKz0gc3RhY2sxOyB9XG4gIHJldHVybiBidWZmZXIgKyBcIlxcbiAgICA8L3NwYW4+XFxuICAgIDxzcGFuIGNsYXNzPVxcXCJoaHYtZ2FtZWluZm9cXFwiPlxcbiAgICAgIFwiXG4gICAgKyAoKHN0YWNrMSA9IChoZWxwZXJzLmlmdmFsdWUgfHwgKGRlcHRoMCAmJiBkZXB0aDAuaWZ2YWx1ZSkgfHwgYWxpYXM0KS5jYWxsKGFsaWFzMywoKHN0YWNrMSA9IChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5pbmZvIDogZGVwdGgwKSkgIT0gbnVsbCA/IHN0YWNrMS5nYW1ldHlwZSA6IHN0YWNrMSkse1wibmFtZVwiOlwiaWZ2YWx1ZVwiLFwiaGFzaFwiOntcInZhbHVlXCI6XCJ0b3VybmFtZW50XCJ9LFwiZm5cIjpjb250YWluZXIucHJvZ3JhbSgyNywgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLm5vb3AsXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIilcbiAgICArIFwiXFxuICAgICAgXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuZ2FtZW5vIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxuICAgICAgRzogXCJcbiAgICArIGFsaWFzMihhbGlhczEoKChzdGFjazEgPSAoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuaW5mbyA6IGRlcHRoMCkpICE9IG51bGwgPyBzdGFjazEuaGFuZGlkIDogc3RhY2sxKSwgZGVwdGgwKSlcbiAgICArIFwiXFxuICAgIDwvc3Bhbj5cXG4gIDwvZGl2PlxcbiAgPGRpdiBjbGFzcz1cXFwiaGh2LXRhYmxlXFxcIj5cXG4gICAgPHRhYmxlPlxcbiAgICAgIDx0aGVhZD5cXG4gICAgICA8dHI+XFxuICAgICAgICA8dGg+UG9zPC90aD5cXG4gICAgICAgIDx0aD5OYW1lPC90aD5cXG4gICAgICAgIDx0aD5DYXJkczwvdGg+XFxuICAgICAgICA8dGg+TTwvdGg+XFxuICAgICAgICA8dGg+UHJlZmxvcDwvdGg+XFxuICAgICAgICA8dGg+RmxvcDwvdGg+XFxuICAgICAgICA8dGg+VHVybjwvdGg+XFxuICAgICAgICA8dGg+Uml2ZXI8L3RoPlxcbiAgICAgIDwvdHI+XFxuICAgICAgPC90aGVhZD5cXG4gICAgICA8dGJvZHk+XFxuXCJcbiAgICArICgoc3RhY2sxID0gaGVscGVycy5lYWNoLmNhbGwoYWxpYXMzLChkZXB0aDAgIT0gbnVsbCA/IGRlcHRoMC5wbGF5ZXJzIDogZGVwdGgwKSx7XCJuYW1lXCI6XCJlYWNoXCIsXCJoYXNoXCI6e30sXCJmblwiOmNvbnRhaW5lci5wcm9ncmFtKDI5LCBkYXRhLCAwKSxcImludmVyc2VcIjpjb250YWluZXIubm9vcCxcImRhdGFcIjpkYXRhfSkpICE9IG51bGwgPyBzdGFjazEgOiBcIlwiKVxuICAgICsgXCIgICAgICA8L3Rib2R5PlxcbiAgICA8L3RhYmxlPlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCIxXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIuaGh2LXBsYXllciB7XFxuICBkaXNwbGF5OiB0YWJsZS1yb3c7XFxufVxcblwiO1xufSxcIjNcIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBoZWxwZXIsIGFsaWFzMT1kZXB0aDAgIT0gbnVsbCA/IGRlcHRoMCA6IHt9LCBhbGlhczI9aGVscGVycy5oZWxwZXJNaXNzaW5nLCBhbGlhczM9XCJmdW5jdGlvblwiLCBhbGlhczQ9Y29udGFpbmVyLmVzY2FwZUV4cHJlc3Npb247XG5cbiAgcmV0dXJuIFwiXFxuLmhodi1wbGF5ZXIge1xcbiAgZGlzcGxheTogbm9uZTtcXG59XFxuLmhodi1wbGF5ZXIuXCJcbiAgICArIGFsaWFzNCgoKGhlbHBlciA9IChoZWxwZXIgPSBoZWxwZXJzLnNob3cgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnNob3cgOiBkZXB0aDApKSAhPSBudWxsID8gaGVscGVyIDogYWxpYXMyKSwodHlwZW9mIGhlbHBlciA9PT0gYWxpYXMzID8gaGVscGVyLmNhbGwoYWxpYXMxLHtcIm5hbWVcIjpcInNob3dcIixcImhhc2hcIjp7fSxcImRhdGFcIjpkYXRhfSkgOiBoZWxwZXIpKSlcbiAgICArIFwiIHtcXG4gIGRpc3BsYXk6IHRhYmxlLXJvdztcXG59XFxuXFxuLmhodi1oYW5kIHtcXG4gIGRpc3BsYXk6IG5vbmU7XFxufVxcbi5oaHYtaGFuZC5cIlxuICAgICsgYWxpYXM0KCgoaGVscGVyID0gKGhlbHBlciA9IGhlbHBlcnMuc2hvd0hhbmQgfHwgKGRlcHRoMCAhPSBudWxsID8gZGVwdGgwLnNob3dIYW5kIDogZGVwdGgwKSkgIT0gbnVsbCA/IGhlbHBlciA6IGFsaWFzMiksKHR5cGVvZiBoZWxwZXIgPT09IGFsaWFzMyA/IGhlbHBlci5jYWxsKGFsaWFzMSx7XCJuYW1lXCI6XCJzaG93SGFuZFwiLFwiaGFzaFwiOnt9LFwiZGF0YVwiOmRhdGF9KSA6IGhlbHBlcikpKVxuICAgICsgXCIge1xcbiAgZGlzcGxheTogYmxvY2s7XFxufVxcblwiO1xufSxcImNvbXBpbGVyXCI6WzcsXCI+PSA0LjAuMFwiXSxcIm1haW5cIjpmdW5jdGlvbihjb250YWluZXIsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICAgIHZhciBzdGFjazE7XG5cbiAgcmV0dXJuICgoc3RhY2sxID0gaGVscGVyc1tcImlmXCJdLmNhbGwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAgOiB7fSwoZGVwdGgwICE9IG51bGwgPyBkZXB0aDAuc2hvd2FsbCA6IGRlcHRoMCkse1wibmFtZVwiOlwiaWZcIixcImhhc2hcIjp7fSxcImZuXCI6Y29udGFpbmVyLnByb2dyYW0oMSwgZGF0YSwgMCksXCJpbnZlcnNlXCI6Y29udGFpbmVyLnByb2dyYW0oMywgZGF0YSwgMCksXCJkYXRhXCI6ZGF0YX0pKSAhPSBudWxsID8gc3RhY2sxIDogXCJcIik7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzQ29tcGlsZXIgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnNDb21waWxlci50ZW1wbGF0ZSh7XCJjb21waWxlclwiOls3LFwiPj0gNC4wLjBcIl0sXCJtYWluXCI6ZnVuY3Rpb24oY29udGFpbmVyLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgICByZXR1cm4gXCIuaGh2LWhhbmQge1xcbiAgd2lkdGg6IDcwMHB4O1xcbiAgYmFja2dyb3VuZDogIzMzMztcXG4gIGJvcmRlcjogMXB4IHNvbGlkICMzMzM7XFxuICBib3JkZXItcmFkaXVzOiA2cHggNnB4IDAgMDtcXG4gIGJveC1zaGFkb3c6IDZweCA2cHggMTJweCAjODg4O1xcbiAgbWFyZ2luOiAwIDAgMTBweCAwO1xcbn1cXG4uaGh2LWhlYWRlciB7XFxuICBjb2xvcjogeWVsbG93Z3JlZW47XFxuICBoZWlnaHQ6IDIwcHg7XFxuICBwYWRkaW5nOiAycHg7XFxuICBmb250LWZhbWlseTogbW9ub3NwYWNlO1xcbn1cXG4uaGh2LWJvYXJkIHtcXG4gIGJhY2tncm91bmQ6IGFudGlxdWV3aGl0ZTtcXG4gIGJvcmRlci1yYWRpdXM6IDNweDtcXG4gIGhlaWdodDogMjBweDtcXG4gIGNvbG9yOiBibGFjaztcXG4gIHBhZGRpbmc6IDFweCAwcHggMXB4IDJweDtcXG4gIG1hcmdpbi1yaWdodDogM3B4O1xcbiAgbWluLXdpZHRoOiA2MHB4O1xcbn1cXG4uaGh2LWNhcmQtdmFsdWUsXFxuLmhodi1jYXJkLXN1aXQge1xcbiAgZm9udC1mYW1pbHk6IHZlcmRhbmE7XFxuICBmb250LXNpemU6IDEzcHg7XFxufVxcbi5oaHYtY2FyZC1zdWl0IHtcXG4gIG1hcmdpbi1yaWdodDogMnB4O1xcbiAgZm9udC1zaXplOiAxNXB4O1xcbn1cXG4uaGh2LWNhcmQtc3VpdC5zLFxcbi5oaHYtY2FyZC1zdWl0LmMge1xcbiAgY29sb3I6IGJsYWNrO1xcbn1cXG4uaGh2LWNhcmQtc3VpdC5kLFxcbi5oaHYtY2FyZC1zdWl0Lmgge1xcbiAgY29sb3I6IHJlZDtcXG59XFxuLmhodi10YWJsZSB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGZvbnQtZmFtaWx5OiBJbmNvbnNvbGF0YSwgbW9ub3NwYWNlO1xcbn1cXG5cXG4uaGh2LXRhYmxlIHRoIHtcXG4gIHRleHQtYWxpZ246IGxlZnQ7XFxuICBmb250LXNpemU6IDEzcHg7XFxufVxcblxcbi5oaHYtdGFibGUgdGQge1xcbiAgdGV4dC1hbGlnbjogbGVmdDtcXG4gIHBhZGRpbmc6IDBweCA0cHggMHB4IDRweDtcXG4gIHdoaXRlLXNwYWNlOiBwcmU7XFxuICBmb250LXNpemU6IDEzcHg7XFxufVxcbi5oaHYtdGFibGUgLmhodi1jYXJkLXZhbHVlLFxcbi5oaHYtdGFibGUgLmhodi1jYXJkLXN1aXQge1xcbiAgZm9udC1zaXplOiAxM3B4O1xcbn1cXG5cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCgxKSB7IHdpZHRoOiAxMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoMikgeyB3aWR0aDogMTAwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCgzKSB7IHdpZHRoOiAzMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoNCkgeyB3aWR0aDogMTBweDsgdGV4dC1hbGlnbjogcmlnaHQ7fVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDUpIHsgd2lkdGg6IDEwMHB4OyB9XFxuLmhodi10YWJsZSB0ZDpudGgtY2hpbGQoNikgeyB3aWR0aDogMTAwcHg7IH1cXG4uaGh2LXRhYmxlIHRkOm50aC1jaGlsZCg3KSB7IHdpZHRoOiAxMDBweDsgfVxcbi5oaHYtdGFibGUgdGQ6bnRoLWNoaWxkKDgpIHsgd2lkdGg6IDEwMHB4OyB9XFxuXCI7XG59LFwidXNlRGF0YVwiOnRydWV9KTtcbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJpbmZvXCI6IHtcbiAgICBcInJvb21cIjogXCJwb2tlcnN0YXJzXCIsXG4gICAgXCJoYW5kaWRcIjogXCIxNDk2NTE5OTI1NDhcIixcbiAgICBcImdhbWV0eXBlXCI6IFwidG91cm5hbWVudFwiLFxuICAgIFwiZ2FtZW5vXCI6IFwiMTQ5NTE5MjYzMFwiLFxuICAgIFwiY3VycmVuY3lcIjogXCIkXCIsXG4gICAgXCJkb25hdGlvblwiOiAwLjkxLFxuICAgIFwicmFrZVwiOiAwLjA5LFxuICAgIFwiYnV5aW5cIjogMSxcbiAgICBcInBva2VydHlwZVwiOiBcImhvbGRlbVwiLFxuICAgIFwibGltaXRcIjogXCJub2xpbWl0XCIsXG4gICAgXCJsZXZlbFwiOiBcInhpIFwiLFxuICAgIFwic2JcIjogNDAwLFxuICAgIFwiYmJcIjogODAwLFxuICAgIFwieWVhclwiOiAyMDE2LFxuICAgIFwibW9udGhcIjogMyxcbiAgICBcImRheVwiOiAxLFxuICAgIFwiaG91clwiOiAxLFxuICAgIFwibWluXCI6IDI5LFxuICAgIFwic2VjXCI6IDQxLFxuICAgIFwidGltZXpvbmVcIjogXCJFVFwiLFxuICAgIFwiYW50ZVwiOiA1MCxcbiAgICBcInBsYXllcnNcIjogNCxcbiAgICBcImFueUludmVzdGVkXCI6IHRydWUsXG4gICAgXCJhbnlTYXdGbG9wXCI6IHRydWVcbiAgfSxcbiAgXCJ0YWJsZVwiOiB7XG4gICAgXCJ0YWJsZW5vXCI6IDMsXG4gICAgXCJtYXhzZWF0c1wiOiA5LFxuICAgIFwiYnV0dG9uXCI6IDNcbiAgfSxcbiAgXCJib2FyZFwiOiB7XG4gICAgXCJjYXJkMVwiOiBcIjNjXCIsXG4gICAgXCJjYXJkMlwiOiBcIkpjXCIsXG4gICAgXCJjYXJkM1wiOiBcIjNoXCIsXG4gICAgXCJjYXJkNFwiOiBcIjZoXCIsXG4gICAgXCJjYXJkNVwiOiBcIjNkXCJcbiAgfSxcbiAgXCJwbGF5ZXJzXCI6IFtcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiA0LFxuICAgICAgXCJjaGlwc1wiOiAxNTQ1MSxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDE1MDAxLFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMTUwMDEsXG4gICAgICBcImNoaXBzVHVyblwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAxNTAwMSxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAxNTAwMSxcbiAgICAgIFwibVwiOiAxMSxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJmb2xkXCIsXG4gICAgICAgICAgXCJwb3RcIjogNDYwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW10sXG4gICAgICBcInNiXCI6IHRydWUsXG4gICAgICBcInByZWZsb3BPcmRlclwiOiAyLFxuICAgICAgXCJwb3N0ZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc1wiOiBcInNiXCIsXG4gICAgICBcIm5hbWVcIjogXCJEbWVsbG9IXCIsXG4gICAgICBcImludmVzdGVkXCI6IHRydWUsXG4gICAgICBcInNhd0Zsb3BcIjogZmFsc2VcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDksXG4gICAgICBcImNoaXBzXCI6IDIyMDYwLFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMjEyMTAsXG4gICAgICBcImNoaXBzRmxvcFwiOiAyMTIxMCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDIxMjEwLFxuICAgICAgXCJjaGlwc0FmdGVyXCI6IDIxMjEwLFxuICAgICAgXCJtXCI6IDE2LFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImZvbGRcIixcbiAgICAgICAgICBcInBvdFwiOiA0NjAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwiaGVyb1wiOiB0cnVlLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCI0Y1wiLFxuICAgICAgICBcImNhcmQyXCI6IFwiMmRcIlxuICAgICAgfSxcbiAgICAgIFwiYmJcIjogdHJ1ZSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDMsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zXCI6IFwiYmJcIixcbiAgICAgIFwibmFtZVwiOiBcImhlbGRcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogMSxcbiAgICAgIFwiY2hpcHNcIjogMTU4NzUsXG4gICAgICBcImNoaXBzUHJlZmxvcFwiOiAxNTgyNSxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDE0MjI1LFxuICAgICAgXCJjaGlwc1R1cm5cIjogMTE4MjUsXG4gICAgICBcImNoaXBzUml2ZXJcIjogMTAyMjUsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogNzAyNSxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiA3MDI1LFxuICAgICAgXCJtXCI6IDExLFxuICAgICAgXCJwcmVmbG9wXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcInJhaXNlXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAyLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMTYwMCxcbiAgICAgICAgICBcInBvdFwiOiAxNDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYmV0XCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjUsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAyNDAwLFxuICAgICAgICAgIFwicG90XCI6IDQ2MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwidHVyblwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjaGVja1wiLFxuICAgICAgICAgIFwicG90XCI6IDk0MDBcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMSxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MDAsXG4gICAgICAgICAgXCJwb3RcIjogMTEwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwicml2ZXJcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2hlY2tcIixcbiAgICAgICAgICBcInBvdFwiOiAxMjYwMFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY2FsbFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMC4yLFxuICAgICAgICAgIFwiYWxsaW5cIjogZmFsc2UsXG4gICAgICAgICAgXCJhbW91bnRcIjogMzIwMCxcbiAgICAgICAgICBcInBvdFwiOiAxNTgwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zXCI6IFwiY29cIixcbiAgICAgIFwiY2FyZHNcIjoge1xuICAgICAgICBcImNhcmQxXCI6IFwiVGRcIixcbiAgICAgICAgXCJjYXJkMlwiOiBcIlRjXCJcbiAgICAgIH0sXG4gICAgICBcIm5hbWVcIjogXCJGaXNjaGVyc2l0b1wiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IHRydWVcbiAgICB9LFxuICAgIHtcbiAgICAgIFwic2VhdG5vXCI6IDMsXG4gICAgICBcImNoaXBzXCI6IDE0MTE0LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMTQwNjQsXG4gICAgICBcImNoaXBzRmxvcFwiOiAxMjQ2NCxcbiAgICAgIFwiY2hpcHNUdXJuXCI6IDEwMDY0LFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDg0NjQsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogNTI2NCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNDI2NCxcbiAgICAgIFwibVwiOiAxMCxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjUsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAxNjAwLFxuICAgICAgICAgIFwicG90XCI6IDMwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjMsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAyNDAwLFxuICAgICAgICAgIFwicG90XCI6IDcwMDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwidHVyblwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJiZXRcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMixcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE2MDAsXG4gICAgICAgICAgXCJwb3RcIjogOTQwMFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJyaXZlclwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJiZXRcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMyxcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDMyMDAsXG4gICAgICAgICAgXCJwb3RcIjogMTI2MDBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiY29sbGVjdFwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMSxcbiAgICAgICAgICBcIndpbmFsbFwiOiB0cnVlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDE5MDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImJ1dHRvblwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAzLFxuICAgICAgXCJwb3NcIjogXCJidVwiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCJRc1wiLFxuICAgICAgICBcImNhcmQyXCI6IFwiSmhcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIklyaXNoYTJcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiB0cnVlXG4gICAgfVxuICBdXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcImluZm9cIjoge1xuICAgIFwicm9vbVwiOiBcInBva2Vyc3RhcnNcIixcbiAgICBcImhhbmRpZFwiOiBcIjE0OTY1MjA1OTQyMlwiLFxuICAgIFwiZ2FtZXR5cGVcIjogXCJ0b3VybmFtZW50XCIsXG4gICAgXCJnYW1lbm9cIjogXCIxNDk1MTkyNjMwXCIsXG4gICAgXCJjdXJyZW5jeVwiOiBcIiRcIixcbiAgICBcImRvbmF0aW9uXCI6IDAuOTEsXG4gICAgXCJyYWtlXCI6IDAuMDksXG4gICAgXCJidXlpblwiOiAxLFxuICAgIFwicG9rZXJ0eXBlXCI6IFwiaG9sZGVtXCIsXG4gICAgXCJsaW1pdFwiOiBcIm5vbGltaXRcIixcbiAgICBcImxldmVsXCI6IFwieGkgXCIsXG4gICAgXCJzYlwiOiA0MDAsXG4gICAgXCJiYlwiOiA4MDAsXG4gICAgXCJ5ZWFyXCI6IDIwMTYsXG4gICAgXCJtb250aFwiOiAzLFxuICAgIFwiZGF5XCI6IDEsXG4gICAgXCJob3VyXCI6IDEsXG4gICAgXCJtaW5cIjogMzMsXG4gICAgXCJzZWNcIjogNTQsXG4gICAgXCJ0aW1lem9uZVwiOiBcIkVUXCIsXG4gICAgXCJhbnRlXCI6IDUwLFxuICAgIFwicGxheWVyc1wiOiA0LFxuICAgIFwiYW55SW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICBcImFueVNhd0Zsb3BcIjogZmFsc2VcbiAgfSxcbiAgXCJ0YWJsZVwiOiB7XG4gICAgXCJ0YWJsZW5vXCI6IDMsXG4gICAgXCJtYXhzZWF0c1wiOiA5LFxuICAgIFwiYnV0dG9uXCI6IDNcbiAgfSxcbiAgXCJib2FyZFwiOiB7XG4gICAgXCJjYXJkMVwiOiBcIjhoXCIsXG4gICAgXCJjYXJkMlwiOiBcIktkXCIsXG4gICAgXCJjYXJkM1wiOiBcIjJzXCIsXG4gICAgXCJjYXJkNFwiOiBcIjZzXCIsXG4gICAgXCJjYXJkNVwiOiBcIjRzXCJcbiAgfSxcbiAgXCJwbGF5ZXJzXCI6IFtcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiA0LFxuICAgICAgXCJjaGlwc1wiOiAzMzMwMixcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDMyODUyLFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMjY4OTMsXG4gICAgICBcImNoaXBzVHVyblwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAyNjg5MyxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNjg5MyxcbiAgICAgIFwibVwiOiAyNCxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJjYWxsXCIsXG4gICAgICAgICAgXCJyYXRpb1wiOiAwLjYsXG4gICAgICAgICAgXCJhbGxpblwiOiBmYWxzZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAzMDI1LFxuICAgICAgICAgIFwicG90XCI6IDQ4MjVcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNhbGxcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDAuMixcbiAgICAgICAgICBcImFsbGluXCI6IGZhbHNlLFxuICAgICAgICAgIFwiYW1vdW50XCI6IDI5MzQsXG4gICAgICAgICAgXCJwb3RcIjogMTQyMDlcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtdLFxuICAgICAgXCJzYlwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAwLFxuICAgICAgXCJwb3NcIjogXCJzYlwiLFxuICAgICAgXCJjYXJkc1wiOiB7XG4gICAgICAgIFwiY2FyZDFcIjogXCI3aFwiLFxuICAgICAgICBcImNhcmQyXCI6IFwiN2RcIlxuICAgICAgfSxcbiAgICAgIFwibmFtZVwiOiBcIkRtZWxsb0hcIixcbiAgICAgIFwiaW52ZXN0ZWRcIjogdHJ1ZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH0sXG4gICAge1xuICAgICAgXCJzZWF0bm9cIjogOSxcbiAgICAgIFwiY2hpcHNcIjogNjQwOSxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDU1NTksXG4gICAgICBcImNoaXBzRmxvcFwiOiAwLFxuICAgICAgXCJjaGlwc1R1cm5cIjogMCxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAwLFxuICAgICAgXCJjaGlwc1Nob3dkb3duXCI6IDAsXG4gICAgICBcImNoaXBzQWZ0ZXJcIjogMTYzNDMsXG4gICAgICBcIm1cIjogNSxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJyYWlzZVwiLFxuICAgICAgICAgIFwicmF0aW9cIjogMS45LFxuICAgICAgICAgIFwiYWxsaW5cIjogdHJ1ZSxcbiAgICAgICAgICBcImFtb3VudFwiOiA1NTU5LFxuICAgICAgICAgIFwicG90XCI6IDc4NTBcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIFwiZmxvcFwiOiBbXSxcbiAgICAgIFwidHVyblwiOiBbXSxcbiAgICAgIFwicml2ZXJcIjogW10sXG4gICAgICBcInNob3dkb3duXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwidHlwZVwiOiBcImNvbGxlY3RcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDEsXG4gICAgICAgICAgXCJ3aW5hbGxcIjogdHJ1ZSxcbiAgICAgICAgICBcImFtb3VudFwiOiAxNjM0M1xuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJoZXJvXCI6IHRydWUsXG4gICAgICBcImNhcmRzXCI6IHtcbiAgICAgICAgXCJjYXJkMVwiOiBcIlFkXCIsXG4gICAgICAgIFwiY2FyZDJcIjogXCJRc1wiXG4gICAgICB9LFxuICAgICAgXCJiYlwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMyxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAxLFxuICAgICAgXCJwb3NcIjogXCJiYlwiLFxuICAgICAgXCJuYW1lXCI6IFwiaGVsZFwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiAxLFxuICAgICAgXCJjaGlwc1wiOiAzNDc1LFxuICAgICAgXCJjaGlwc1ByZWZsb3BcIjogMzQyNSxcbiAgICAgIFwiY2hpcHNGbG9wXCI6IDAsXG4gICAgICBcImNoaXBzVHVyblwiOiAwLFxuICAgICAgXCJjaGlwc1JpdmVyXCI6IDAsXG4gICAgICBcImNoaXBzU2hvd2Rvd25cIjogMCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAwLFxuICAgICAgXCJtXCI6IDIsXG4gICAgICBcInByZWZsb3BcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwicmFpc2VcIixcbiAgICAgICAgICBcInJhdGlvXCI6IDQuMyxcbiAgICAgICAgICBcImFsbGluXCI6IHRydWUsXG4gICAgICAgICAgXCJhbW91bnRcIjogMzQyNSxcbiAgICAgICAgICBcInBvdFwiOiAxNDAwXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBcImZsb3BcIjogW10sXG4gICAgICBcInR1cm5cIjogW10sXG4gICAgICBcInJpdmVyXCI6IFtdLFxuICAgICAgXCJzaG93ZG93blwiOiBbXSxcbiAgICAgIFwicHJlZmxvcE9yZGVyXCI6IDAsXG4gICAgICBcInBvc3RmbG9wT3JkZXJcIjogMixcbiAgICAgIFwicG9zXCI6IFwiY29cIixcbiAgICAgIFwiY2FyZHNcIjoge1xuICAgICAgICBcImNhcmQxXCI6IFwiQWRcIixcbiAgICAgICAgXCJjYXJkMlwiOiBcIjJjXCJcbiAgICAgIH0sXG4gICAgICBcIm5hbWVcIjogXCJGaXNjaGVyc2l0b1wiLFxuICAgICAgXCJpbnZlc3RlZFwiOiB0cnVlLFxuICAgICAgXCJzYXdGbG9wXCI6IGZhbHNlXG4gICAgfSxcbiAgICB7XG4gICAgICBcInNlYXRub1wiOiAzLFxuICAgICAgXCJjaGlwc1wiOiAyNDMxNCxcbiAgICAgIFwiY2hpcHNQcmVmbG9wXCI6IDI0MjY0LFxuICAgICAgXCJjaGlwc0Zsb3BcIjogMjQyNjQsXG4gICAgICBcImNoaXBzVHVyblwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNSaXZlclwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNTaG93ZG93blwiOiAyNDI2NCxcbiAgICAgIFwiY2hpcHNBZnRlclwiOiAyNDI2NCxcbiAgICAgIFwibVwiOiAxNyxcbiAgICAgIFwicHJlZmxvcFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcInR5cGVcIjogXCJmb2xkXCIsXG4gICAgICAgICAgXCJwb3RcIjogNDgyNVxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgXCJmbG9wXCI6IFtdLFxuICAgICAgXCJ0dXJuXCI6IFtdLFxuICAgICAgXCJyaXZlclwiOiBbXSxcbiAgICAgIFwic2hvd2Rvd25cIjogW10sXG4gICAgICBcImJ1dHRvblwiOiB0cnVlLFxuICAgICAgXCJwcmVmbG9wT3JkZXJcIjogMSxcbiAgICAgIFwicG9zdGZsb3BPcmRlclwiOiAzLFxuICAgICAgXCJwb3NcIjogXCJidVwiLFxuICAgICAgXCJuYW1lXCI6IFwiSXJpc2hhMlwiLFxuICAgICAgXCJpbnZlc3RlZFwiOiBmYWxzZSxcbiAgICAgIFwic2F3RmxvcFwiOiBmYWxzZVxuICAgIH1cbiAgXVxufSJdfQ==
