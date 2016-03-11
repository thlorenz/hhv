/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const hhv = require('../hhv')
const hhp = require('hhp')
const hha = require('hha')

const visualizedHandsEl = document.getElementById('visualized-hands')
const handhistoryEl = document.getElementById('handhistory-entry')
const filterEl = document.getElementById('filter')

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

const historyTxt = handhistoryEl.textContent.trim()
const histories = hhp.extractHands(historyTxt)
const analyzed = histories.map(analyzeHistory).filter(isnull)
const sorted = hhv.sortByDateTime(analyzed)
const rendered = sorted.map(render).join('')
const allNames = Object.keys(players)
const hero = analyzed[0].hero
const filterHtml = hhv.renderFilter(allNames, hero)

visualizedHandsEl.innerHTML = rendered

function initializeFilter () {
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
initializeFilter()
