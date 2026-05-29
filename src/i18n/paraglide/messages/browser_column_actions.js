/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Column_ActionsInputs */

const uk_browser_column_actions = /** @type {(inputs: Browser_Column_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії`)
};

const en_browser_column_actions = /** @type {(inputs: Browser_Column_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Actions`)
};

/**
* | output |
* | --- |
* | "Actions" |
*
* @param {Browser_Column_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_column_actions = /** @type {((inputs?: Browser_Column_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Column_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_column_actions(inputs)
	return en_browser_column_actions(inputs)
});