/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')

handlebars.registerHelper('ifvalue', function (conditional, options) {
  if (options.hash.value === conditional) {
    return options.fn(this)
  } else {
    return options.inverse(this)
  }
})

const holdemTmpl = fs.readFileSync(path.join(__dirname, 'templates', 'holdem.hbs'), 'utf8')
const cssTmpl = fs.readFileSync(path.join(__dirname, 'templates', 'style.css'), 'utf8')
const headTmpl = fs.readFileSync(path.join(__dirname, 'templates', 'head.hbs'), 'utf8')
const holdem = handlebars.compile(holdemTmpl)
const css = handlebars.compile(cssTmpl)()
const head = handlebars.compile(headTmpl)({ css: css })

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
        + (a.hasOwnProperty('ratio') ? a.ratio : '   ')
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
  }
}

exports.css = css
exports.head = head

exports.render = function render (analyzed) {
  const render = {
      info    : analyzed.info
    , table   : analyzed.table
    , board   : renderCards(analyzed.board)
    , players : analyzed.players.map(renderPlayer)
  }
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
if (!module.parent && typeof window === 'undefined') {
const actiononall = exports.render(require('./test/fixtures/holdem/actiononall.json'))
const allin = exports.render(require('./test/fixtures/holdem/allin-preflop.json'))
const html = exports.pageify(actiononall + allin)
fs.writeFileSync(path.join(__dirname, 'test.html'), html, 'utf8')
}
