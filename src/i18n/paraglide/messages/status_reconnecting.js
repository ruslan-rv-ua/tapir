/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_ReconnectingInputs */

const uk_status_reconnecting = /** @type {(inputs: Status_ReconnectingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перепідключення...`)
};

const en_status_reconnecting = /** @type {(inputs: Status_ReconnectingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Reconnecting...`)
};

/**
* | output |
* | --- |
* | "Reconnecting..." |
*
* @param {Status_ReconnectingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_reconnecting = /** @type {((inputs?: Status_ReconnectingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_ReconnectingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_reconnecting(inputs)
	return en_status_reconnecting(inputs)
});