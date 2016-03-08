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

