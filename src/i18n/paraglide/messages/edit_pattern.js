/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Edit_PatternInputs */

const uk_edit_pattern = /** @type {(inputs: Edit_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Редагувати патерн`)
};

const en_edit_pattern = /** @type {(inputs: Edit_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Edit pattern`)
};

/**
* | output |
* | --- |
* | "Edit pattern" |
*
* @param {Edit_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const edit_pattern = /** @type {((inputs?: Edit_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Edit_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_edit_pattern(inputs)
	return en_edit_pattern(inputs)
});