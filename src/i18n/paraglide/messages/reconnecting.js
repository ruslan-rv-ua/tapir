/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown>, attempt: NonNullable<unknown> }} ReconnectingInputs */

const uk_reconnecting = /** @type {(inputs: ReconnectingInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Перепідключення: ${i?.name}, спроба ${i?.attempt}`)
};

const en_reconnecting = /** @type {(inputs: ReconnectingInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Reconnecting: ${i?.name}, attempt ${i?.attempt}`)
};

/**
* | output |
* | --- |
* | "Reconnecting: {name}, attempt {attempt}" |
*
* @param {ReconnectingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const reconnecting = /** @type {((inputs: ReconnectingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<ReconnectingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_reconnecting(inputs)
	return en_reconnecting(inputs)
});