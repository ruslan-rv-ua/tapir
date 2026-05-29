/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_Added_AtInputs */

const uk_column_added_at = /** @type {(inputs: Column_Added_AtInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дата додавання`)
};

const en_column_added_at = /** @type {(inputs: Column_Added_AtInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Date added`)
};

/**
* | output |
* | --- |
* | "Date added" |
*
* @param {Column_Added_AtInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_added_at = /** @type {((inputs?: Column_Added_AtInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_Added_AtInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_added_at(inputs)
	return en_column_added_at(inputs)
});