/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Select_StreamInputs */

const uk_select_stream = /** @type {(inputs: Select_StreamInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Вибрати потік: ${i?.name}`)
};

const en_select_stream = /** @type {(inputs: Select_StreamInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Select stream: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Select stream: {name}" |
*
* @param {Select_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const select_stream = /** @type {((inputs: Select_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Select_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_select_stream(inputs)
	return en_select_stream(inputs)
});