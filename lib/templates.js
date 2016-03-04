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

const headTmpl   = fs.readFileSync(path.join(__dirname, '..', 'templates', 'head.hbs'), 'utf8')
const cssTmpl    = fs.readFileSync(path.join(__dirname, '..', 'templates', 'style.hbs'), 'utf8')
const holdemTmpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'holdem.hbs'), 'utf8')

exports.head   = handlebars.compile(headTmpl)
exports.css    = handlebars.compile(cssTmpl)
exports.holdem = handlebars.compile(holdemTmpl)
