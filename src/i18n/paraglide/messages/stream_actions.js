/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stream_ActionsInputs */

const uk_stream_actions = /** @type {(inputs: Stream_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Дії для ${i?.name}`)
};

const en_stream_actions = /** @type {(inputs: Stream_ActionsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Actions for ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Actions for {name}" |
*
* @param {Stream_ActionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_actions = /** @type {((inputs: Stream_ActionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_ActionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_actions(inputs)
	return en_stream_actions(inputs)
});