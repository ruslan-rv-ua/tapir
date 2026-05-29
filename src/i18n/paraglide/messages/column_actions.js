/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_ActionsInputs */

const uk_column_actions = /** @type {(inputs: Column_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії`)
};

const en_column_actions = /** @type {(inputs: Column_ActionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Actions`)
};

/**
* | output |
* | --- |
* | "Actions" |
*
* @param {Column_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_actions = /** @type {((inputs?: Column_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_actions(inputs)
	return en_column_actions(inputs)
});