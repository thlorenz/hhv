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
