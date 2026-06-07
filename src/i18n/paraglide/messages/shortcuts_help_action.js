/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Help_ActionInputs */

const uk_shortcuts_help_action = /** @type {(inputs: Shortcuts_Help_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Довідник гарячих клавіш`)
};

const en_shortcuts_help_action = /** @type {(inputs: Shortcuts_Help_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Keyboard shortcuts help`)
};

/**
* | output |
* | --- |
* | "Keyboard shortcuts help" |
*
* @param {Shortcuts_Help_ActionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_help_action = /** @type {((inputs?: Shortcuts_Help_ActionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Help_ActionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_help_action(inputs)
	return en_shortcuts_help_action(inputs)
});