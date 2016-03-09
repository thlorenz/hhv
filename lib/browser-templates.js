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
