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
