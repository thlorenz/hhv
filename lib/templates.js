/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const helpers = require('./helpers')
helpers(handlebars)

const headTmpl            = fs.readFileSync(path.join(__dirname, '..', 'templates', 'head.hbs'), 'utf8')
const cssTmpl             = fs.readFileSync(path.join(__dirname, '..', 'templates', 'style.hbs'), 'utf8')
const filterCssTmpl       = fs.readFileSync(path.join(__dirname, '..', 'templates', 'style-filter.hbs'), 'utf8')
const selectPlayerCssTmpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'style-select-player.hbs'), 'utf8')
const uiFilterTmpl        = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ui-filter.hbs'), 'utf8')
const holdemTmpl          = fs.readFileSync(path.join(__dirname, '..', 'templates', 'holdem.hbs'), 'utf8')

exports.head            = handlebars.compile(headTmpl)
exports.css             = handlebars.compile(cssTmpl)
exports.filterCss       = handlebars.compile(filterCssTmpl)
exports.selectPlayerCss = handlebars.compile(selectPlayerCssTmpl)
exports.uiFilter        = handlebars.compile(uiFilterTmpl)
exports.holdem          = handlebars.compile(holdemTmpl)
