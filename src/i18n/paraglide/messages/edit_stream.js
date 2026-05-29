/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Edit_StreamInputs */

const uk_edit_stream = /** @type {(inputs: Edit_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Редагувати потік`)
};

const en_edit_stream = /** @type {(inputs: Edit_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Edit stream`)
};

/**
* | output |
* | --- |
* | "Edit stream" |
*
* @param {Edit_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const edit_stream = /** @type {((inputs?: Edit_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Edit_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_edit_stream(inputs)
	return en_edit_stream(inputs)
});