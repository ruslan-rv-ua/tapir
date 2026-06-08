/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Help_TitleInputs */

const uk_shortcuts_help_title = /** @type {(inputs: Shortcuts_Help_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гарячі клавіші`)
};

const en_shortcuts_help_title = /** @type {(inputs: Shortcuts_Help_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Keyboard shortcuts`)
};

/**
* | output |
* | --- |
* | "Keyboard shortcuts" |
*
* @param {Shortcuts_Help_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_help_title = /** @type {((inputs?: Shortcuts_Help_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Help_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_help_title(inputs)
	return en_shortcuts_help_title(inputs)
});