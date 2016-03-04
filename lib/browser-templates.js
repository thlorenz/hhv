/* eslint-disable comma-style, operator-linebreak, space-unary-ops, no-multi-spaces, key-spacing, indent */
'use strict'

const handlebars = require('hbsfy/runtime')

handlebars.registerHelper('ifvalue', function (conditional, options) {
  if (options.hash.value === conditional) {
    return options.fn(this)
  } else {
    return options.inverse(this)
  }
})

exports.head   = require('../templates/head.hbs')
exports.css    = require('../templates/style.hbs')
exports.holdem = require('../templates/holdem.hbs')
